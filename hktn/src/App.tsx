import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from './state/notifications';
import { useUser } from './state/useUser';
import { BanksCatalogPage } from './pages/BanksCatalogPage';
import { CallbackPage } from './pages/CallbackPage';
import { ConsentStatusPage } from './pages/ConsentStatusPage';
import { DashboardPage } from './pages/DashboardPage';
import { DebtGoalPage } from './pages/DebtGoalPage';
import { GoalsLandingPage } from './pages/GoalsLandingPage';
import { IngestionPage } from './pages/IngestionPage';
import { PreviewPage } from './pages/PreviewPage';
import { SaveGoalPage } from './pages/SaveGoalPage';
import { UserIdPage } from './pages/UserIdPage';
import { ConsentProcessPage } from './pages/ConsentProcessPage';

const ProtectedRoute: React.FC = () => {
  const { userId } = useUser();
  const location = useLocation();
  if (!userId) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean; message?: string }> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-main">
          <div className="card">
            <h2>Что-то пошло не так</h2>
            <p>{this.state.message}</p>
            <button className="btn" onClick={() => this.setState({ hasError: false })}>
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Header: React.FC = () => {
  const { userId, clearUser } = useUser();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  return (
    <header style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <strong>FinPulse MPA</strong>
        {userId ? <span style={{ marginLeft: 12, color: '#475569' }}>User: {userId}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary btn" onClick={() => navigate('/dashboard')}>
          Дашборд
        </button>
        {userId ? (
          <button
            className="btn-secondary btn"
            onClick={() => {
              clearUser();
              notify('Сессия очищена');
              navigate('/');
            }}
          >
            Сбросить
          </button>
        ) : null}
      </div>
    </header>
  );
};

export const App: React.FC = () => (
  <AppErrorBoundary>
    <div className="app-shell">
      <Header />
      <Routes>
        <Route path="/" element={<UserIdPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/banks" element={<BanksCatalogPage />} />
          <Route path="/banks/:bankId/status" element={<ConsentStatusPage />} />
          <Route path="/banks/preview" element={<PreviewPage />} />
          <Route path="/onboarding/consent" element={<ConsentProcessPage />} />
          <Route path="/goals" element={<GoalsLandingPage />} />
          <Route path="/goals/save" element={<SaveGoalPage />} />
          <Route path="/goals/debts" element={<DebtGoalPage />} />
          <Route path="/ingest" element={<IngestionPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  </AppErrorBoundary>
);

export default App;
