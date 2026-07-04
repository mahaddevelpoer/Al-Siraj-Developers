import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function EmployeeManagement({ townName }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (townName) loadAgents();
  }, [townName]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone_number, is_active, created_at, agent_town')
        .eq('role', 'agent')
        .eq('agent_town', townName)
        .order('created_at', { ascending: false });

      if (!error && data) setAgents(data);
    } catch (e) {
      console.error('Error loading agents:', e);
    }
    setLoading(false);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Agents - {townName}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Agents who registered via the app login system
          </div>
        </div>
        <div style={{
          padding: '6px 14px', background: '#eff6ff', borderRadius: 20,
          fontSize: 12, fontWeight: 700, color: '#2563eb', border: '1px solid #bfdbfe',
        }}>
          {agents.length} Agent{agents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Info bar */}
      <div style={{
        padding: '10px 16px', background: '#f0fdf4', borderRadius: 10,
        border: '1px solid #86efac', marginBottom: 20, fontSize: 12, color: '#15803d',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>
          Agents automatically appear here when they <strong>register via the app</strong> and are approved by CEO.
          To add an agent, ask them to register from the login screen.
        </span>
      </div>

      {/* Agents List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div>Loading agents...</div>
        </div>
      ) : agents.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: 'var(--bg-card)',
          borderRadius: 16, border: '2px dashed var(--border-color)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No Agents Yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No agents registered for <strong>{townName}</strong> yet.<br />
            Ask your agents to register via the login screen.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {agents.map(agent => (
            <div
              key={agent.id}
              style={{
                padding: 18, background: 'var(--bg-card)', borderRadius: 14,
                border: '1px solid var(--border-color)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'box-shadow 0.2s',
              }}
            >
              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: 'white', fontWeight: 700, flexShrink: 0,
                }}>
                  {(agent.full_name || 'A').charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.full_name || 'Unnamed Agent'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Agent</div>
                </div>
              </div>

              {/* Details */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                {agent.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>ðŸ“§</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.email}</span>
                  </div>
                )}
                {agent.phone_number && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>ðŸ“ž</span><span>{agent.phone_number}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>ðŸ“…</span>
                  <span>Joined {new Date(agent.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>

              {/* Status badge */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: agent.is_active ? '#dcfce7' : '#fef2f2',
                  color: agent.is_active ? '#15803d' : '#dc2626',
                }}>
                  {agent.is_active ? 'âœ… Active' : 'â³ Pending Approval'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

