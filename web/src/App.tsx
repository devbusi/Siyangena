import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { DemoBar, RequireAuth, RoleTabBar } from "./components/ui";
import { AppProvider } from "./lib/store";
import { AuthProvider } from "./lib/auth";
import { Landing, Setup, SignIn, SignUp, Verify } from "./screens/Auth";
import { BuyTickets, EventPage } from "./screens/EventPage";
import { Discover, Tickets, WalletScreen } from "./screens/FanHome";
import { Alerts, Wishlist } from "./screens/Alerts";
import { LiveSale } from "./screens/LiveSale";
import { Mandate } from "./screens/Mandate";
import { CreateEvent, PromoterDesk, PromoterEvents, PromoterHome, PromoterOnboard } from "./screens/Promoter";
import { Resell } from "./screens/Resell";
import { AdminEvents, AdminOverview, AdminPeople, AdminReview } from "./screens/Admin";
import { Account } from "./screens/Account";
import { Agents } from "./screens/Agents";
import { AdminPayouts, CancelEvent, DoorScanner, PromoterPayouts } from "./screens/PromoterOps";

export function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <HashRouter>
          <div className="app">
            <DemoBar />
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/events" element={<Discover />} />
              <Route path="/events/:id" element={<EventPage />} />

              {/* Signed in */}
              <Route path="/verify" element={<RequireAuth><Verify /></RequireAuth>} />
              <Route path="/events/:id/buy" element={<RequireAuth><BuyTickets /></RequireAuth>} />
              <Route path="/events/:id/agent" element={<RequireAuth><Mandate /></RequireAuth>} />
              <Route path="/events/:id/live" element={<RequireAuth><LiveSale /></RequireAuth>} />
              <Route path="/agents" element={<RequireAuth><Agents /></RequireAuth>} />
              <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
              <Route path="/tickets/:eventId/resell" element={<RequireAuth><Resell /></RequireAuth>} />
              <Route path="/wallet" element={<RequireAuth><WalletScreen /></RequireAuth>} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/alerts" element={<RequireAuth><Alerts /></RequireAuth>} />
              <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />

              {/* Promoters */}
              <Route path="/promoter" element={<RequireAuth role="promoter"><PromoterHome /></RequireAuth>} />
              <Route path="/promoter/apply" element={<RequireAuth role="promoter"><PromoterOnboard /></RequireAuth>} />
              <Route path="/promoter/events" element={<RequireAuth role="promoter"><PromoterEvents /></RequireAuth>} />
              <Route path="/promoter/create" element={<RequireAuth role="promoter"><CreateEvent /></RequireAuth>} />
              <Route path="/promoter/events/:id" element={<RequireAuth role="promoter"><PromoterDesk /></RequireAuth>} />
              <Route path="/promoter/events/:id/cancel" element={<RequireAuth role="promoter"><CancelEvent /></RequireAuth>} />
              <Route path="/promoter/events/:id/door" element={<RequireAuth role="promoter"><DoorScanner /></RequireAuth>} />
              <Route path="/promoter/payouts" element={<RequireAuth role="promoter"><PromoterPayouts /></RequireAuth>} />

              {/* Admins */}
              <Route path="/admin" element={<RequireAuth role="admin"><AdminOverview /></RequireAuth>} />
              <Route path="/admin/review" element={<RequireAuth role="admin"><AdminReview /></RequireAuth>} />
              <Route path="/admin/people" element={<RequireAuth role="admin"><AdminPeople /></RequireAuth>} />
              <Route path="/admin/events" element={<RequireAuth role="admin"><AdminEvents /></RequireAuth>} />
              <Route path="/admin/payouts" element={<RequireAuth role="admin"><AdminPayouts /></RequireAuth>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <RoleTabBar />
          </div>
        </HashRouter>
      </AppProvider>
    </AuthProvider>
  );
}
