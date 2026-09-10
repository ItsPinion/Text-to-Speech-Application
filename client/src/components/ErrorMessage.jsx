/**
 * ERROR readout — maps HTTP statuses to human copy per the frozen contract
 * (docs/API.md status-code map). 400 surfaces the server's exact validation
 * message so users learn the real rule they broke.
 */
export function mapErrorToMessage(err) {
  if (!err) return null;
  if (err.status === 0) return 'Cannot reach the server — check your connection.';
  if (err.status === 429) return 'Too many requests — please wait a few minutes.';
  if (err.status >= 500) return 'Speech service unavailable — try again shortly.';
  return err.message || 'Something went wrong.';
}

export default function ErrorMessage({ error }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="animate-boot-reveal border-2 border-neon-orange bg-neon-orange/10 p-4"
    >
      <p className="font-mono text-sm text-neon-orange">
        <span className="font-heading font-bold tracking-wider">{'> ERROR:'}</span>{' '}
        {mapErrorToMessage(error)}
      </p>
    </div>
  );
}
