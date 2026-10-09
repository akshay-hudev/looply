import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";

import Shell from "./components/Shell";
import { auth } from "./lib/api";
import Accounts from "./pages/Accounts";
import AuthPage from "./pages/Auth";
import CampaignPage from "./pages/Campaign";
import Campaigns from "./pages/Campaigns";
import Dashboard from "./pages/Dashboard";
import NewBusiness from "./pages/NewBusiness";
import NewCampaign from "./pages/NewCampaign";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function Guard({ children }: { children: JSX.Element }) {
  return auth.token() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<Guard><Shell /></Guard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignPage />} />
          <Route path="/businesses/new" element={<NewBusiness />} />
          <Route path="/accounts" element={<Accounts />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
