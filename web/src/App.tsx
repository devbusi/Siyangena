import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { DemoBar } from "./components/ui";
import { AppProvider } from "./lib/store";
import { EventPage } from "./screens/EventPage";
import { Discover, Tickets, Wishlist } from "./screens/FanHome";
import { Verify, Welcome } from "./screens/FanOnboarding";
import { LiveSale } from "./screens/LiveSale";
import { Mandate } from "./screens/Mandate";
import { CreateEvent, PromoterDesk, PromoterOnboard } from "./screens/Promoter";
import { Resell } from "./screens/Resell";

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="app">
          <DemoBar />
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/events" element={<Discover />} />
            <Route path="/event" element={<EventPage />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/mandate" element={<Mandate />} />
            <Route path="/live" element={<LiveSale />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/resell" element={<Resell />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/promoter" element={<PromoterDesk />} />
            <Route path="/promoter/onboard" element={<PromoterOnboard />} />
            <Route path="/promoter/create" element={<CreateEvent />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </HashRouter>
    </AppProvider>
  );
}
