import { useState, useEffect } from 'react';
import { supabase, auth } from '../../lib/supabase';

export default function AgentRegister() {
  const [step, setStep] = useState(1);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState('');

  const [towns, setTowns] = useState([]);
  const [townLoadingError, setTownLoadingError] = useState('');
  const [selectedTownOption, setSelectedTownOption] = useState('single');
  const [selectedTowns, setSelectedTowns] = useState([]);
  const [townSearchQuery, setTownSearchQuery] = useState('');

  const [tempUserId, setTempUserId] = useState(null);

  useEffect(() => {
    if (step === 2) {
      loadTowns();
    }
  }, [step]);

  const loadTowns = async () => {
    try {
      const { data, error } = await supabase
        .from('towns')
        .select('id, town_name, location')
        .order('town_name');

      if (error) throw error;
      setTowns(data || []);
    } catch (err) {
      setTownLoadingError(err.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegistrationLoading(true);
    setRegistrationError('');

    try {
      const { data: authData, error: authError } = await auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      setTempUserId(authData.user.id);
      setStep(2);
    } catch (error) {
      setRegistrationError(error.message);
    } finally {
      setRegistrationLoading(false);
    }
  };

  const handleTownSelection = async (e) => {
    e.preventDefault();

    if (selectedTownOption === 'single' && selectedTowns.length === 0) {
      alert('Please select at least one town');
      return;
    }

    try {
      const selectedTownNames = selectedTownOption === 'all'
        ? towns.map(t => t.town_name).join(',')
        : selectedTowns.join(',');

      const { error: profileError } = await supabase
        .from('users')
        .insert([{
          id: tempUserId,
          email,
          full_name: fullName,
          phone_number: phone,
          role: 'agent',
          agent_towns: selectedTownNames,
          agent_license_number: licenseNumber,
          is_active: false,
        }]);

      if (profileError) throw profileError;

      const { error: appealError } = await supabase
        .from('appeals')
        .upsert([{
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
    } catch (err) {
      setTownLoadingError(err.message);
    }
  };

  useEffect(() => {
    if (step !== 3 || !tempUserId) return;
    const channel = supabase
      .channel(`agent-register-approval-${tempUserId}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${tempUserId}`,
        },
        async (payload) => {
          if (!payload.new?.is_active) return;
          try {
            await auth.signInWithPassword({ email, password });
          } catch (_) {}
          alert('CEO approved your account. Agent dashboard is now available.');
          window.location.href = '/';
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [step, tempUserId, email, password]);

  const townNameDisplay = (t) => t.town_name || t.name || '';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        padding: 40,
        borderRadius: 'var(--radius-lg)',
        maxWidth: 450,
        width: '100%',
        border: '1px solid var(--border-color)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {step === 1 ? '\u{1F464}' : step === 2 ? '\u{1F3D8}\uFE0F' : '\u{1F510}'}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            {step === 1 ? 'Agent Registration' : step === 2 ? 'Select Your Towns' : 'Verify with CEO'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {step === 1 && 'Create your agent account'}
            {step === 2 && 'Which towns will you work in?'}
            {step === 3 && 'Waiting for CEO approval'}
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            {[1, 2, 3].map(s => (
              <div
                key={s}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: step >= s ? 'var(--accent-blue)' : 'var(--border-color)',
                  transition: 'all 0.3s',
                }}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={handleRegister}>
            {false && <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Your full name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              />
            </div>}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Password *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Strong password"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              />
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                At least 8 characters, mix of letters & numbers
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03XX XXXXXXX"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                License Number *
              </label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                required
                placeholder="e.g. AG-2024-001"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              />
            </div>

            {registrationError && (
              <div style={{
                padding: 10,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
                fontSize: 12,
                border: '1px solid #fecaca',
              }}>
                {'\u274C'} {registrationError}
              </div>
            )}

            <button
              type="submit"
              disabled={registrationLoading}
              style={{
                width: '100%',
                padding: '11px',
                background: 'var(--accent-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: registrationLoading ? 'not-allowed' : 'pointer',
                opacity: registrationLoading ? 0.6 : 1,
                transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => !registrationLoading && (e.target.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.target.style.transform = 'translateY(0)')}
            >
              {registrationLoading ? '\u23F3 Creating...' : '\u2705 Next: Select Towns'}
            </button>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16, textAlign: 'center' }}>
              Already have an account? <a href="/login" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 700 }}>Login</a>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleTownSelection}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                Scope of Work
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setSelectedTownOption('single')}
                  style={{
                    padding: '12px',
                    border: selectedTownOption === 'single' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: selectedTownOption === 'single' ? 'rgba(0,102,204,0.08)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    transition: 'all 0.15s',
                  }}
                >
                  {'\u{1F4CD}'} Specific Towns
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTownOption('all')}
                  style={{
                    padding: '12px',
                    border: selectedTownOption === 'all' ? '2px solid var(--accent-green)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: selectedTownOption === 'all' ? 'rgba(16,124,65,0.08)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    transition: 'all 0.15s',
                  }}
                >
                  {'\u{1F30D}'} All Towns
                </button>
              </div>
            </div>

            {selectedTownOption === 'single' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Select Towns *
                </label>
                <input
                  type="text"
                  placeholder="Search towns..."
                  value={townSearchQuery}
                  onChange={(e) => setTownSearchQuery(e.target.value.toLowerCase())}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                    marginBottom: 10,
                  }}
                />
                <div style={{
                  maxHeight: 250,
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 8,
                }}>
                  {towns
                    .filter(t => townNameDisplay(t).toLowerCase().includes(townSearchQuery))
                    .map(town => (
                      <label
                        key={town.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTowns.includes(townNameDisplay(town))}
                          onChange={(e) => {
                            const name = townNameDisplay(town);
                            if (e.target.checked) {
                              setSelectedTowns([...selectedTowns, name]);
                            } else {
                              setSelectedTowns(selectedTowns.filter(t => t !== name));
                            }
                          }}
                          style={{ marginRight: 8, cursor: 'pointer', accentColor: 'var(--accent-blue)' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>
                          {'\u{1F4CD}'} {townNameDisplay(town)}
                        </span>
                      </label>
                    ))}
                </div>
                {selectedTowns.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: 8,
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11,
                  }}>
                    {'\u2705'} Selected: {selectedTowns.join(', ')}
                  </div>
                )}
              </div>
            )}

            {selectedTownOption === 'all' && (
              <div style={{
                marginBottom: 20,
                padding: 12,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, color: '#107c41', marginBottom: 8 }}>
                  {'\u{1F30D}'} Multi-Town Access
                </div>
                <div style={{ color: '#666' }}>
                  You'll have access to {towns.length} towns: {towns.map(t => townNameDisplay(t)).join(', ')}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#65a30d' }}>
                  {'\u{1F4CC}'} CEO will verify your credentials for multi-town access
                </div>
              </div>
            )}

            {townLoadingError && (
              <div style={{
                padding: 10,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
                fontSize: 12,
              }}>
                {'\u274C'} {townLoadingError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '11px',
                background: 'var(--accent-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: 8,
              }}
            >
              {'\u2705'} Next: Get Verification Code
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                color: 'var(--accent-blue)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {'\u2190'} Back
            </button>
          </form>
        )}

        {step === 3 && (
          <div>
            <div style={{
              padding: 14,
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0c4a6e', marginBottom: 8 }}>
                {'\u{1F510}'} CEO Approval Required
              </div>
              <div style={{ fontSize: 11, color: '#0f172a', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 6 }}>
                  {'\u2705'} Account created successfully
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Awaiting CEO Approval:</strong>
                </div>
                <div style={{ background: 'white', padding: 8, borderRadius: 4, marginBottom: 6 }}>
                  <div>{'\u{1F4E7}'} <strong>Email:</strong> {email}</div>
                  <div>{'\u{1F464}'} <strong>Name:</strong> {fullName}</div>
                  <div>{'\u{1F3D8}\uFE0F'} <strong>Towns:</strong> {selectedTownOption === 'all' ? 'All' : selectedTowns.join(', ')}</div>
                </div>
                <div style={{ background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 6, border: '1px solid #fecaca' }}>
                  <strong style={{ color: '#991b1b' }}>{'\u26A0\uFE0F'} Next Step:</strong>
                  <div style={{ fontSize: 10, color: '#7f1d1d', marginTop: 4 }}>
                    CEO will review your details. You cannot access the Agent Dashboard until CEO approves this request.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Enter Verification Code *
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="XXXXXX"
                required
                style={{
                  width: '100%',
                  padding: '14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 18,
                  letterSpacing: 3,
                  textAlign: 'center',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              />
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                6-digit code sent to your email
              </p>
            </div>

            {false && (
              <div style={{
                padding: 10,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
                fontSize: 12,
                border: '1px solid #fecaca',
              }}>
                {'\u274C'} {otpError}
              </div>
            )}

            {false && <button
              type="submit"
              disabled={true}
              style={{
                width: '100%',
                padding: '11px',
                background: 'var(--border-color)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'not-allowed',
                opacity: 0.6,
              }}
            >
              Waiting for CEO
            </button>}

            <div style={{
              padding: 12,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 'var(--radius-md)',
              marginBottom: 16,
              fontSize: 12,
              color: '#0f172a',
              lineHeight: 1.6,
            }}>
              <div><strong>Status:</strong> Waiting for CEO approval</div>
              <div><strong>Bound towns:</strong> {selectedTownOption === 'all' ? towns.map(t => townNameDisplay(t)).join(', ') : selectedTowns.join(', ')}</div>
              <div style={{ color: '#475569', marginTop: 6 }}>This screen will continue automatically when CEO approves your account.</div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                color: 'var(--accent-blue)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              {'\u2190'} Back
            </button>

            <div style={{
              marginTop: 16,
              padding: 10,
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 10,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}>
              {'\u{1F4A1}'} CEO will send code within 5-10 minutes. Check your email spam folder if not received.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
