export default function EndpointCard({ endpoint }) {
  return (
    <article className="endpoint-card">
      <header className="endpoint-head">
        <span className={`method-chip method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
        <code className="endpoint-path">{endpoint.path}</code>
        {endpoint.state && (
          <span className={`state-chip st-${endpoint.state}`}>
            {endpoint.state === 'live' ? '✅ live' : endpoint.state === 'partial' ? '🚧 partial' : '⏳ planned'}
          </span>
        )}
      </header>
      <p className="endpoint-purpose">{endpoint.purpose}</p>

      {endpoint.requestFields && (
        <div className="endpoint-block">
          <h4>Request body</h4>
          <table className="field-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Rules</th>
              </tr>
            </thead>
            <tbody>
              {endpoint.requestFields.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code>{f.name}</code>
                    {f.required && <span className="req-star" title="required"> *</span>}
                  </td>
                  <td>
                    <code>{f.type}</code>
                  </td>
                  <td>{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre>{JSON.stringify(endpoint.requestExample, null, 2)}</pre>
        </div>
      )}

      <div className="endpoint-block">
        <h4>Responses</h4>
        <ul className="response-list">
          {endpoint.responses.map((r) => (
            <li key={r.status} className="response-row">
              <span className={`status-chip s${r.status}`}>{r.status}</span>
              <div>
                <p>{r.description}</p>
                {r.body && <pre>{JSON.stringify(r.body, null, 2)}</pre>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
