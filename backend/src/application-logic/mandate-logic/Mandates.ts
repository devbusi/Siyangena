import type { Mandate } from "@drop/shared";
import { state, save } from "../../lib/store";
import { ApiError, forbidden } from "../../lib/utils/errors";
import { newId } from "../../lib/utils/ids";
import { zar } from "../../lib/utils/money";
import { Events } from "../event-logic/Events";

const events = new Events();

const key = (fanId: string, eventId: string) => `${fanId}:${eventId}`;

// Lazy to avoid an import cycle with Drop.
function eventIdOrFeatured(eventId?: string): string {
  if (eventId) return eventId;
  const { Drop } = require("../drop-logic/Drop") as typeof import("../drop-logic/Drop");
  return new Drop().getRecord().id;
}

// The fan's limits for one event. Set by the human in the web app, read-only to the agent,
// and checked on every agent purchase. A model saying "no" is not enforcement: this is.
// Buying directly in the app needs no limits: the human is choosing there and then.
export class Mandates {
  getMandate(fanId: string, eventId?: string): Mandate {
    const mandate = state.mandates[key(fanId, eventIdOrFeatured(eventId))];
    if (!mandate) {
      throw new ApiError(404, "NO_MANDATE", `Fan ${fanId} has no limits set for this event`);
    }
    return mandate;
  }

  findMandate(fanId: string, eventId?: string): Mandate | null {
    try {
      return state.mandates[key(fanId, eventIdOrFeatured(eventId))] ?? null;
    } catch {
      return null;
    }
  }

  putMandate(fanId: string, params: { quantity: number; ceilingZar: number }, eventId?: string): Mandate {
    const id = eventIdOrFeatured(eventId);
    const existing = state.mandates[key(fanId, id)];
    const bought = existing?.bought ?? 0;
    const mandate: Mandate = {
      id: existing?.id ?? newId("mandate"),
      fanId,
      eventId: id,
      quantity: params.quantity,
      ceilingZar: zar(params.ceilingZar),
      bought,
      status: bought >= params.quantity ? "filled" : "active",
    };
    state.mandates[key(fanId, id)] = mandate;
    save();
    return mandate;
  }

  cancelMandate(fanId: string, eventId?: string): Mandate {
    const mandate = this.getMandate(fanId, eventId);
    mandate.status = "cancelled";
    save();
    return mandate;
  }

  // Throws 403 MANDATE_EXCEEDED (and puts it on the live feed) if a purchase breaks the limits.
  // unitPriceZar is all-in: face value for primary, price + fee for resale.
  assertWithinMandate(fanId: string, quantity: number, unitPriceZar: number, eventId?: string): Mandate {
    const id = eventIdOrFeatured(eventId);
    const mandate = state.mandates[key(fanId, id)];
    const block = (message: string): never => {
      events.emit("mandate.blocked", message, { fanId, eventId: id });
      throw forbidden("MANDATE_EXCEEDED", message);
    };

    if (!mandate || mandate.status === "cancelled") {
      return block(`${fanId}: no active limits for this event`);
    }
    if (mandate.status === "filled" || mandate.bought + quantity > mandate.quantity) {
      return block(
        `${fanId}: limits allow ${mandate.quantity} ticket(s), already bought ${mandate.bought}, asked for ${quantity}`,
      );
    }
    if (unitPriceZar > Number(mandate.ceilingZar) + 1e-9) {
      return block(`${fanId}: R${zar(unitPriceZar)} per ticket is over the R${mandate.ceilingZar} ceiling`);
    }
    return mandate;
  }

  recordPurchase(fanId: string, quantity: number, eventId?: string) {
    const mandate = this.findMandate(fanId, eventId);
    if (!mandate) return;
    mandate.bought += quantity;
    if (mandate.bought >= mandate.quantity && mandate.status === "active") {
      mandate.status = "filled";
    }
    save();
  }
}
