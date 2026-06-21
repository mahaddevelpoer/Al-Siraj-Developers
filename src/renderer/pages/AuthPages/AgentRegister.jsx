import { useEffect, useState } from 'react';
import { supabase, auth } from '../../lib/supabase';

export default function AgentRegister() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [towns, setTowns] = useState([]);
  const [selectedTowns, setSelectedTowns] = useState([]);
  const [townSearchQuery, setTownSearchQuery] = useState('');
  const [selectedTownOption, setSelectedTownOption] = useState('single');
  const [tempUserId, setTempUserId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== 2) return;
    supabase
      .from('towns')
      .select('id, town_name, Town_Name, location')
      .order('town_name')
      .then(({ data, error }) => {
        if (error) throw error;
        setTowns(data || []);
      })
      .catch((e) => setError(e.message));
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !tempUserId) return;
    const channel = supabase
      .channel(`agent-register-approval-${tempUserId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${tempUserId}`,
      }, async (payload) => {
        if (!payload.new?.is_active) return;
        try { await auth.signInWithPassword({ email, password }); } catch (_) {}
        alert('CEO approved your account. Agent dashboard is now available.');
        window.location.href = '/';
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [step, tempUserId, email, password]);

  const townNameDisplay = (town) => town?.town_name || town?.Town_Name || town?.name || '';
  const selectedTownNames = selectedTownOption === 'all'
    ? towns.map(townNameDisplay).filter(Boolean).join(',')
    : selectedTowns.join(',');

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: signUpError } = await auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone_number: phone, role: 'agent' } },
      });
      if (signUpError) throw signUpError;
      setTempUserId(data.user.id);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTownSelection = async (e) => {
    e.preventDefault();
    if (!selectedTownNames) {
      setError('Please select at least one town');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const profile = {
        id: tempUserId,
        email,
        full_name: fullName,
        phone_number: phone,
        role: 'agent',
        agent_town: selectedTownNames,
        agent_towns: selectedTownNames,
        agent_license_number: licenseNumber,
        is_active: false,
      };

      const { error: profileError } = await supabase.from('users').upsert([profile], { onConflict: 'id' });
      if (profileError) throw profileError;

      const { error: appealError } = await supabase.from('appeals').upsert([{
        requested_by_user_id: tempUserId,
        requested_by_role: 'agent',
        appeal_type: 'agent_registration',
        entity_type: 'agent',
        entity_id: tempUserId,
        requested_data: {
          townName: selectedTownNames,
          agent_town: selectedTownNames,
          agent_towns: selectedTownNames,
          email,
          full_name: fullName,
          phone_number: phone,
          license_number: licenseNumber,
        },
        reason: `Agent registration approval request for ${selectedTownNames}`,
        status: 'pending',
      }], { onConflict: 'requested_by_user_id,entity_id,appeal_type' });
      if (appealError) throw appealError;

      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef4ff', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid #dbe7ff', borderRadius: 16, padding: 28, boxShadow: '0 20px 55px rgba(15,23,42,0.14)' }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>
          {step === 1 ? 'Agent Registration' : step === 2 ? 'Select Town' : 'Waiting for CEO Approval'}
        </h1>
        <p style={{ margin: '8px 0 22px', color: '#475569', fontSize: 13 }}>
          {step === 1 && 'Create your agent account.'}
          {step === 2 && 'Choose the town this agent account will be bound with.'}
          {step === 3 && 'Dashboard access will unlock after CEO approval.'}
        </p>

        {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleRegister} style={{ display: 'grid', gap: 14 }}>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Full name" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required placeholder="License number" />
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Creating...' : 'Next: Select Town'}</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleTownSelection} style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" className={`btn ${selectedTownOption === 'single' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedTownOption('single')}>Specific Town</button>
              <button type="button" className={`btn ${selectedTownOption === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedTownOption('all')}>All Towns</button>
            </div>
            {selectedTownOption === 'single' && (
              <>
                <input value={townSearchQuery} onChange={(e) => setTownSearchQuery(e.target.value.toLowerCase())} placeholder="Search town" />
                <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #dbe7ff', borderRadius: 10, padding: 8 }}>
                  {towns.filter(t => townNameDisplay(t).toLowerCase().includes(townSearchQuery)).map(town => {
                    const name = townNameDisplay(town);
                    return (
                      <label key={town.id || name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedTowns.includes(name)}
                          onChange={(e) => setSelectedTowns(e.target.checked ? [...selectedTowns, name] : selectedTowns.filter(t => t !== name))}
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            <div style={{ padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, color: '#1e3a8a', fontSize: 12 }}>
              Bound town(s): <strong>{selectedTownNames || 'None selected'}</strong>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Submitting...' : 'Submit to CEO Approval'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
          </form>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: 14, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, color: '#0f172a', fontSize: 13, lineHeight: 1.6 }}>
              <div><strong>Status:</strong> Waiting for CEO approval</div>
              <div><strong>Agent:</strong> {fullName}</div>
              <div><strong>Town:</strong> {selectedTownNames}</div>
              <div style={{ color: '#475569', marginTop: 8 }}>This screen will continue automatically when CEO approves this agent.</div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back to Town Selection</button>
          </div>
        )}
      </div>
    </div>
  );
}
