import type { Mandate } from "@drop/shared";
import { state, save } from "../../lib/store";
import { ApiError, forbidden } from "../../lib/utils/errors";
import { newId } from "../../lib/utils/ids";
import { zar } from "../../lib/utils/money";
import { Events } from "../event-logic/Events";

const events = new Events();

// The fan's limits. Set by the human in the web app, stored here, read-only to the agent,
// and checked on every primary sale and resale. A model saying "no" is not enforcement: this is.
export class Mandates {
  getMandate(fanId: string): Mandate {
    const mandate = state.mandates[fanId];
    if (!mandate) {
      throw new ApiError(404, "NO_MANDATE", `Fan ${fanId} has no mandate`);
    }
    return mandate;
  }

  findMandate(fanId: string): Mandate | null {
    return state.mandates[fanId] ?? null;
  }

  putMandate(fanId: string, params: { quantity: number; ceilingZar: number }): Mandate {
    const existing = state.mandates[fanId];
    const bought = existing?.bought ?? 0;
    const mandate: Mandate = {
      id: existing?.id ?? newId("mandate"),
      fanId,
      quantity: params.quantity,
      ceilingZar: zar(params.ceilingZar),
      bought,
      status: bought >= params.quantity ? "filled" : "active",
    };
    state.mandates[fanId] = mandate;
    save();
    return mandate;
  }

  cancelMandate(fanId: string): Mandate {
    const mandate = this.getMandate(fanId);
    mandate.status = "cancelled";
    save();
    return mandate;
  }

  // Throws 403 MANDATE_EXCEEDED (and puts it on the live feed) if a purchase breaks the mandate.
  // unitPriceZar is all-in: face value for primary, price + fee for resale.
  assertWithinMandate(fanId: string, quantity: number, unitPriceZar: number): Mandate {
    const mandate = state.mandates[fanId];
    const block = (message: string): never => {
      events.emit("mandate.blocked", message, { fanId });
      throw forbidden("MANDATE_EXCEEDED", message);
    };

    if (!mandate || mandate.status === "cancelled") {
      return block(`${fanId}: no active mandate`);
    }
    if (mandate.status === "filled" || mandate.bought + quantity > mandate.quantity) {
      return block(
        `${fanId}: mandate allows ${mandate.quantity} ticket(s), already bought ${mandate.bought}, asked for ${quantity}`,
      );
    }
    if (unitPriceZar > Number(mandate.ceilingZar) + 1e-9) {
      return block(`${fanId}: R${zar(unitPriceZar)} per ticket is over the R${mandate.ceilingZar} ceiling`);
    }
    return mandate;
  }

  recordPurchase(fanId: string, quantity: number) {
    const mandate = state.mandates[fanId];
    if (!mandate) return;
    mandate.bought += quantity;
    if (mandate.bought >= mandate.quantity && mandate.status === "active") {
      mandate.status = "filled";
    }
    save();
  }
}
