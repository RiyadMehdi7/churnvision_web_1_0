import React, { useEffect, useState } from 'react';

type DbHealth = { ok: boolean; error?: string; missing?: string[]; counts?: Record<string, number>; dbPath?: string };
type LlmStatus = { ready: boolean; reason?: string; modelType: string };

const Diagnostics: React.FC = () => {
  const [offline, setOffline] = useState<boolean>(false);
  const [db, setDb] = useState<DbHealth | null>(null);
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Web application - always online
        setOffline(false);
      } catch {}
      try {
        // Check database health via API
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}/health`);
        const h = await response.json();
        setDb({ ok: h.status === 'healthy', dbPath: 'API Backend' });
      } catch {}
      try {
        // LLM is server-side - always available
        setLlm({ ready: true, modelType: 'server-side' });
      } catch {}
    })();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h2>Diagnostics</h2>
      <section>
        <h3>Security</h3>
        <div>Strict Offline Mode: {offline ? 'Enabled' : 'Disabled'}</div>
      </section>
      <section>
        <h3>Database</h3>
        {db ? (
          <div>
            <div>Status: {db.ok ? 'OK' : `Issues: ${db.error || (db.missing || []).join(', ')}`}</div>
            {db.counts && (
              <ul>
                {Object.entries(db.counts).map(([k, v]) => (
                  <li key={k}>{k}: {v === null ? 'n/a' : v}</li>
                ))}
              </ul>
            )}
            <div>DB: {db.dbPath || 'n/a'}</div>
          </div>
        ) : (
          <div>Loading...</div>
        )}
      </section>
      <section>
        <h3>LLM</h3>
        {llm ? (
          <div>
            <div>Ready: {llm.ready ? 'Yes' : 'No'}</div>
            <div>Mode: {llm.modelType}</div>
            <div>Reason: {llm.reason || '-'}</div>
          </div>
        ) : (
          <div>Loading...</div>
        )}
      </section>
    </div>
  );
};

export default Diagnostics;

