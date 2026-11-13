import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { DemoBar, RequireAuth } from "./components/ui";
import { AppProvider } from "./lib/store";
import { AuthProvider } from "./lib/auth";
import { Landing, Setup, SignIn, SignUp, Verify } from "./screens/Auth";
import { BuyTickets, EventPage } from "./screens/EventPage";
import { Discover, Tickets, WalletScreen, Wishlist } from "./screens/FanHome";
import { LiveSale } from "./screens/LiveSale";
import { Mandate } from "./screens/Mandate";
import { CreateEvent, PromoterDesk, PromoterHome, PromoterOnboard } from "./screens/Promoter";
import { Resell } from "./screens/Resell";
import { AdminHome } from "./screens/Admin";

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
              <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
              <Route path="/tickets/:eventId/resell" element={<RequireAuth><Resell /></RequireAuth>} />
              <Route path="/wallet" element={<RequireAuth><WalletScreen /></RequireAuth>} />
              <Route path="/wishlist" element={<Wishlist />} />

              {/* Promoters */}
              <Route path="/promoter" element={<RequireAuth role="promoter"><PromoterHome /></RequireAuth>} />
              <Route path="/promoter/apply" element={<RequireAuth role="promoter"><PromoterOnboard /></RequireAuth>} />
              <Route path="/promoter/create" element={<RequireAuth role="promoter"><CreateEvent /></RequireAuth>} />
              <Route path="/promoter/events/:id" element={<RequireAuth role="promoter"><PromoterDesk /></RequireAuth>} />

              {/* Admins */}
              <Route path="/admin" element={<RequireAuth role="admin"><AdminHome /></RequireAuth>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </HashRouter>
      </AppProvider>
    </AuthProvider>
  );
}
