import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from './state/notifications';
import { useUser } from './state/useUser';
import { BanksCatalogPage } from './pages/BanksCatalogPage';
import { DashboardPage } from './pages/DashboardPage';
import { IntegrationStatusPage } from './pages/IntegrationStatusPage';
import { UserIdPage } from './pages/UserIdPage';

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
          <button className="btn-secondary btn" onClick={() => navigate('/integration-status')}>
            Диагностика API
          </button>
        ) : null}
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/integration-status" element={<IntegrationStatusPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  </AppErrorBoundary>
);

export default App;
