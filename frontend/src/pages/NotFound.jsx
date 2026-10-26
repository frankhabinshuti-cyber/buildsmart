import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound({ inApp = false }) {
  return (
    <div className={inApp ? '' : 'container'} style={inApp ? undefined : { padding: '60px 16px' }}>
      <div className="card">
        <EmptyState icon="🧱" title="Page not found" action={<Link className="btn btn-primary" to={inApp ? '/app' : '/'}>{inApp ? 'Back to dashboard' : 'Back to home'}</Link>}>
          The page you are looking for does not exist or was moved.
        </EmptyState>
      </div>
    </div>
  );
}
