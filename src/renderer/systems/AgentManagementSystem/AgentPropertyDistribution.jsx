import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

export default function AgentPropertyDistribution({ agent, onClose }) {
  const [selectedTown, setSelectedTown] = useState('');
  const [properties, setProperties] = useState([]); // Supabase all_sales rows for selected town
  const [selectedProperties, setSelectedProperties] = useState([]); // all_sales.id (UUID)

  const [towns, setTowns] = useState([]); // dropdown source (Supabase)


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);

  const agentTowns = useMemo(() => {
    return (agent?.agent_towns || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }, [agent]);

  useEffect(() => {
    // Unified Supabase source of truth: towns derive from agent_property_access -> all_sales.town_name
    // Fallback: users.agent_towns if mapping can't be derived.
    loadTownsFromSupabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  useEffect(() => {
    // Load access first (selectedProperties)
    if (!agent?.id) return;
    loadAgentProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);


  useEffect(() => {
    // Load properties whenever town changes
    if (!selectedTown) return;
    loadPropertiesForTown(selectedTown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTown]);

  const loadTownsFromSupabase = async () => {
    setLoading(true);
    setError('');
    try {
      if (!agent?.id) {
        setTowns([]);
        setSelectedTown('');
        return;
      }

      // 1) Primary: derive towns from agent_property_access mapping
      // agent_property_access.property_id MUST point to properties.id (UUID).
      // So we fetch towns from properties table (not all_sales).
      let propertyIds = [];
      if (window.api?.getAgentPropertyAccess) {
        const result = await window.api.getAgentPropertyAccess(agent.id);
        if (result?.error === 'TABLE_MISSING') {
          setTableMissing(true);
          setError('Table agent_property_access missing. Click "Setup DB" to create it.');
          setLoading(false);
          return;
        }
        if (Array.isArray(result)) {
          propertyIds = result;
        }
      } else {
        // Fallback: direct Supabase query
        const { data: accessRows, error: accessErr } = await supabase
          .from('agent_property_access')
          .select('property_id')
          .eq('agent_id', agent.id);
        if (accessErr) throw accessErr;
        propertyIds = (accessRows || []).map(r => r.property_id).filter(Boolean);
      }

      if (propertyIds.length > 0) {
        const { data: propRows, error: propErr } = await supabase
          .from('properties')
          .select('Town_Name')
          .in('id', propertyIds);

        if (propErr) throw propErr;

        const derived = Array.from(
          new Set((propRows || []).map(r => (r.Town_Name || '').trim()).filter(Boolean))
        );

        if (derived.length > 0) {
          setTowns(derived);
          if (!derived.includes(selectedTown)) setSelectedTown(derived[0]);
          return;
        }
      }

      // 2) Fallback: use users.agent_towns
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('agent_towns')
        .eq('id', agent.id)
        .single();

      if (userErr) throw userErr;

      const fallback = (userRow?.agent_towns || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      setTowns(fallback);
      if (!selectedTown && fallback.length > 0) setSelectedTown(fallback[0]);
    } catch (e) {
      console.error('Error loading towns:', e);
      // Last resort: use prop
      setTowns(agentTowns);
      if (!selectedTown && agentTowns.length > 0) setSelectedTown(agentTowns[0]);
      if (e?.message?.includes('relation') || e?.message?.includes('does not exist') || e?.message?.includes('schema cache')) {
        setTableMissing(true);
        setError('Table agent_property_access missing. Click "Setup DB" to create it.');
      } else {
        setError('Failed to load towns: ' + (e.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPropertiesForTown = async (town) => {

    setLoading(true);
    setError('');
    try {
      // Use dataLayer pattern: local Excel first (fast, offline), then Supabase
      // This ensures properties show even if not yet synced to cloud
      let props = [];
      let salesRows = [];
      
      if (window.api) {
        // Load from local Excel (primary source)
        const [localPlots, localShops] = await Promise.all([
          window.api.getAllPlots(town),
          window.api.getAllShops(town)
        ]);
        props = [...(localPlots || []), ...(localShops || [])];
        
        // Also load all_sales for merged status
        const localSales = await window.api.getAllSales();
        salesRows = (localSales || []).filter(s => s.Town_Name === town);
      }
      
      // If local Excel is empty, fallback to Supabase
      if (props.length === 0) {
        const { data: supabaseProps, error: propsErr } = await supabase
          .from('properties')
          .select('*')
          .eq('Town_Name', town)
          .order('Property_Number');

        if (!propsErr) {
          props = supabaseProps || [];
        }
        
        const { data: supabaseSales, error: salesErr } = await supabase
          .from('all_sales')
          .select('*')
          .eq('town_name', town);

        if (!salesErr) {
          salesRows = supabaseSales || [];
        }
      }

      const salesMap = new Map(
        (salesRows || []).map(s => [
          `${s.Type}__${s.Plot_Shop_Number}__${s.Town_Name || s.town_name}`,
          s,
        ])
      );

      const mapped = (props || []).map(p => {
        const key = `${p.Property_Type || p.type}__${p.Property_Number || p.Plot_Number || p.Plot_Shop_Number}__${p.Town_Name || p.town_name}`;
        const sale = salesMap.get(key);

        const status =
          sale?.Status ||
          p.Status ||
          (sale ? 'Sold' : 'Available');

        return {
          id: p.id || p.Property_ID || p.Plot_ID || p.Shop_ID, // real UUID from `properties`
          type: p.Property_Type || p.Type || p.type,
          plot_shop_number: p.Property_Number || p.Plot_Number || p.Plot_Shop_Number || p.number,
          town_name: p.Town_Name || p.town_name,
          customer_name: sale?.Customer_Name || p.Customer_Name || p.customer_name || null,
          status,
          // keep originals for search/display robustness
          Property_Type: p.Property_Type || p.Type || p.type,
          Property_Number: p.Property_Number || p.Plot_Number || p.Plot_Shop_Number || p.number,
          Status: status,
        };
      });

      setProperties(mapped);
    } catch (e) {
      console.error('Error loading properties for town:', e);
      setError('Failed to load properties for ' + town + ': ' + (e.message || e));
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAgentProperties = async () => {
    try {
      if (!agent?.id) return;
      let propertyIds = [];
      if (window.api?.getAgentPropertyAccess) {
        const result = await window.api.getAgentPropertyAccess(agent.id);
        if (Array.isArray(result)) {
          propertyIds = result;
        } else if (result?.error === 'TABLE_MISSING') {
          setTableMissing(true);
          setError('Table agent_property_access does not exist. Click "Setup DB" to create it.');
          return;
        } else if (result?.error) {
          console.error('Error loading agent properties:', result.error);
          return;
        }
      } else {
        const { data, error } = await supabase
          .from('agent_property_access')
          .select('property_id')
          .eq('agent_id', agent.id);
        if (error) throw error;
        propertyIds = (data || []).map(d => d.property_id);
      }
      setSelectedProperties(propertyIds);
    } catch (error) {
      console.error('Error loading agent properties:', error);
      if (error.message?.includes('relation') || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        setTableMissing(true);
        setError('Table agent_property_access does not exist. Click "Setup DB" to create it.');
      }
    }
  };


  const handleToggleProperty = (propertyId) => {
    setSelectedProperties(prev =>
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = () => {
    const allIds = filteredProperties.map(p => p.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedProperties.includes(id));

    if (allSelected) {
      setSelectedProperties(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedProperties(prev => [...new Set([...prev, ...allIds])]);
    }
  };


  const handleSetupDb = async () => {
    setSettingUp(true);
    try {
      const res = await window.api.setupAgentDb();
      if (res?.error) {
        if (res.sql) {
          setError('Setup requires Supabase Management API token. Copy the SQL below and run it in Supabase SQL Editor:\n\n' + res.sql);
        } else {
          setError('Setup failed: ' + res.error);
        }
        return;
      }
      setTableMissing(false);
      setError('');
      setLoading(true);
      await loadPropertiesForTown(selectedTown);

      await loadAgentProperties();
    } catch (e) {
      setError('Setup error: ' + e.message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleSaveAccess = async () => {
    setSaving(true);
    setError('');
    try {
      if (window.api?.setAgentPropertyAccess) {
        const result = await window.api.setAgentPropertyAccess({
          agentId: agent.id,
          propertyIds: selectedProperties,
        });
        if (result?.error === 'TABLE_MISSING') {
          setTableMissing(true);
          setError('Table missing. Click Setup DB below.');
          return;
        }
        if (result?.error) throw new Error(result.error);
      } else {
        // Fallback: direct Supabase
        const { error: delErr } = await supabase
          .from('agent_property_access')
          .delete()
          .eq('agent_id', agent.id);
        if (delErr) throw delErr;

        const accessRecords = selectedProperties.map(propertyId => ({
          agent_id: agent.id,
          property_id: propertyId,
          created_at: new Date().toISOString(),
        }));

        if (accessRecords.length > 0) {
          const { error: insErr } = await supabase
            .from('agent_property_access')
            .insert(accessRecords);
          if (insErr) throw insErr;
        }
      }

      if (!agent.is_active) {
        const { error: updErr } = await supabase
          .from('users')
          .update({ is_active: true })
          .eq('id', agent.id);

        if (updErr) throw updErr;
      }

      alert('\u2705 Access granted successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving access:', error);
      if (error.message?.includes('relation') || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        setTableMissing(true);
        setError('Table missing. Click Setup DB below.');
      } else {
        setError('Error saving access: ' + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredProperties = properties.filter(p => {
    const haystack = `${p.type || ''}${p.plot_shop_number || ''}${p.customer_name || ''}${p.town_name || ''}${p.status || ''}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase());
  });


  const statusColor = (status) => {
    if (status === 'Sold') return { bg: '#fef3c7', color: '#92400e' };
    if (status === 'Available') return { bg: '#d1fae5', color: '#065f46' };
    if (status === 'Cancelled') return { bg: '#fee2e2', color: '#991b1b' };
    return { bg: '#e2e8f0', color: '#475569' };
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 30,
        maxWidth: 700,
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
            {'\u{1F4CA}'} Give Property Access to {agent.full_name}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select which properties this agent can view and manage.
            Towns: <strong>{towns.length > 0 ? towns.join(', ') : 'N/A'}</strong>

          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {'\u{1F4CD}'} Town
            </div>
            <select
              value={selectedTown}
              onChange={(e) => setSelectedTown(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {towns.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}

            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder={`Search properties in ${selectedTown}... (Plot#, Buyer name)`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleSelectAll}
              type="button"
              style={{
                padding: '8px 14px',
                background: 'var(--accent-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {filteredProperties.length > 0 && filteredProperties.every(p => selectedProperties.includes(p.id))
                ? '\u274C Deselect All'
                : '\u2705 Select All'}
            </button>
          </div>
        </div>


        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {'\u23F3'} Loading properties for {selectedTown}...
          </div>
        ) : filteredProperties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {'\u{1F4ED}'} No properties found
            {selectedTown && <div style={{ marginTop: 8, fontSize: 11 }}>Town: {selectedTown}</div>}
            <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444' }}>
              Ensure there are rows in Supabase <strong>properties</strong> for this town, or properties have been synced.
            </div>
          </div>
        ) : (

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 20,
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: 8,
          }}>
            {filteredProperties.map(property => {
              const sc = statusColor(property.status);
              return (
                <button
                  key={property.id}
                  onClick={() => handleToggleProperty(property.id)}
                  type="button"
                  style={{
                    padding: 12,
                    border: selectedProperties.includes(property.id)
                      ? '2px solid #2563eb'
                      : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: selectedProperties.includes(property.id)
                      ? 'rgba(37,99,235,0.08)'
                      : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedProperties.includes(property.id)) {
                      e.currentTarget.style.borderColor = 'var(--border-active)';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedProperties.includes(property.id)) {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                    {property.type} #{property.plot_shop_number}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {property.town_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {(property.customer_name || '—').substring(0, 20)}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    background: sc.bg,
                    color: sc.color,
                  }}>
                    {property.status}
                  </span>
                  {selectedProperties.includes(property.id) && (
                    <div style={{ fontSize: 14, marginTop: 4 }}>{'\u2705'}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div style={{
            padding: 10,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 16,
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            {'\u274C'} {error}
          </div>
        )}

        <div style={{
          padding: 12,
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {'\u{1F4CB}'} Summary
          </div>
          <div style={{ fontSize: 12 }}>
            <div>Agent: <strong>{agent.full_name}</strong></div>
            <div>Towns: <strong>{agent.agent_towns || 'N/A'}</strong></div>
            <div>Total Properties: <strong>{properties.length}</strong></div>
            <div>Properties Selected: <strong style={{ color: selectedProperties.length > 0 ? '#059669' : '#ef4444' }}>{selectedProperties.length}</strong></div>
          </div>
        </div>

        {tableMissing && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button
              onClick={handleSetupDb}
              disabled={settingUp}
              style={{
                padding: '6px 16px',
                background: settingUp ? '#94a3b8' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 11,
                cursor: settingUp ? 'not-allowed' : 'pointer',
              }}
              type="button"
            >
              {settingUp ? '\u23F3 Setting up...' : '\u{1F504} Setup DB'}
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button
            onClick={handleSaveAccess}
            disabled={saving || tableMissing}
            style={{
              padding: '10px',
              background: saving || tableMissing ? '#94a3b8' : '#059669',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              cursor: saving || tableMissing ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
            type="button"
          >
            {saving ? '\u23F3 Saving...' : '\u2705 Give Access'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px',
              background: 'var(--border-color)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
