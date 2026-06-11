import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import AgentPropertyDistribution from './AgentPropertyDistribution';

export default function AgentManagement() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);

  useEffect(() => {
    loadAgents();
  }, [activeTab]);

  const loadAgents = async () => {
    try {
      let query = supabase
        .from('users')
        .select('*')
        .eq('role', 'agent');

      if (activeTab === 'pending') {
        query = query.eq('is_active', false);
      } else if (activeTab === 'approved') {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAgent = async (agentId) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: true })
        .eq('id', agentId);

      if (error) throw error;
      loadAgents();
    } catch (error) {
      console.error('Error approving agent:', error);
    }
  };

  const handleRejectAgent = async (agentId) => {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
      loadAgents();
    } catch (error) {
      console.error('Error rejecting agent:', error);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{'\u{1F465}'} Agent Management</h2>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {['pending', 'approved'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setLoading(true);
              }}
              style={{
                padding: '8px 16px',
                background: activeTab === tab ? 'var(--accent-blue)' : 'var(--border-color)',
                color: activeTab === tab ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {tab === 'pending' ? '\u23F3' : '\u2705'} {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {'\u23F3'} Loading agents...
        </div>
      ) : agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {'\u{1F4ED}'} No {activeTab} agents
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {agents.map(agent => (
            <div
              key={agent.id}
              style={{
                padding: 16,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
                  {agent.full_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {'\u{1F4E7}'} {agent.email}
                </div>
                {agent.phone_number && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {'\u{1F4DE}'} {agent.phone_number}
                  </div>
                )}
                {agent.agent_license_number && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {'\u{1F516}'} License: {agent.agent_license_number}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Towns
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                  {agent.agent_towns?.split(',').map(t => t.trim()).length === 1 ? (
                    <span>{'\u{1F4CD}'} {agent.agent_towns}</span>
                  ) : (
                    <>
                      {'\u{1F30D}'} <strong>Multi-town:</strong> {agent.agent_towns}
                    </>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={{
                  padding: '4px 10px',
                  background: agent.is_active ? '#d1fae5' : '#fef3c7',
                  color: agent.is_active ? '#065f46' : '#92400e',
                  borderRadius: '4px',
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {agent.is_active ? '\u2705 Active' : '\u23F3 Pending'}
                </span>
              </div>

              {activeTab === 'pending' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowPropertyModal(true);
                    }}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--accent-blue)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {'\u{1F4CA}'} Give Access
                  </button>
                  <button
                    onClick={() => handleRejectAgent(agent.id)}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--accent-red)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {'\u274C'} Reject
                  </button>
                </div>
              )}

              {activeTab === 'approved' && (
                <button
                  onClick={() => {
                    setSelectedAgent(agent);
                    setShowPropertyModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--accent-blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {'\u{1F4CA}'} Edit Property Access
                </button>
              )}

              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border-color)',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>
                {'\u{1F4C5}'} {new Date(agent.created_at).toLocaleDateString('en-PK')}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPropertyModal && selectedAgent && (
        <AgentPropertyDistribution
          agent={selectedAgent}
          onClose={() => {
            setShowPropertyModal(false);
            setSelectedAgent(null);
            loadAgents();
          }}
        />
      )}
    </div>
  );
}
