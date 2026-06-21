import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, auth } from '../lib/supabase';
import { IconCrown, IconBarChart, IconHandshake, IconEyeOff, IconEye, IconShield } from './Icons';

const DEFAULT_LOGO = './favicon.ico';

function useLogo() {
  const [logoSrc, setLogoSrc] = useState(DEFAULT_LOGO);
  useEffect(() => {
    async function loadLogo() {
      if (window.api?.getLogoDataUrl) {
        try {
          const res = await window.api.getLogoDataUrl();
          if (res?.dataUrl) setLogoSrc(res.dataUrl);
        } catch (e) {}
      }
    }
    loadLogo();
  }, []);
  return logoSrc;
}

const ROLE_STYLES = {
  ceo: { gradient: 'linear-gradient(135deg, #1e293b, #334155)', icon: 'ceo', label: 'CEO', desc: 'Complete control over system & all modules', badge: 'Full Access', panelGradient: 'linear-gradient(135deg, #0a1628, #1e293b)' },
  accountant: { gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)', icon: 'accountant', label: 'Accountant', desc: 'Manage finance, expenses, reports & accounts', badge: 'Financial Access', panelGradient: 'linear-gradient(135deg, #1e40af, #2563eb)' },
};
const ROLE_ICON_COMPONENTS = { ceo: IconCrown, accountant: IconBarChart };

const ROLE_PORTAL = {
  ceo: { title: 'CEO Portal', subtitle: 'Secure access to the AL SIRAJ DEVELOPERS management system.' },
  accountant: { title: 'Accountant Portal', subtitle: 'Manage financial operations for AL SIRAJ DEVELOPERS.' },
};

export default function AuthScreen({ onLogin }) {
  const logoSrc = useLogo();
  const { signIn } = useAuth();
  const [selectedRole, setSelectedRole] = useState(null);
  const [tempRole, setTempRole] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [formMode, setFormMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const formRef = useRef(null);
  const submitRef = useRef(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regTown, setRegTown] = useState('');
  const [regStep, setRegStep] = useState(1);
  const [regUserId, setRegUserId] = useState(null);
  const [wizStep, setWizStep] = useState(1);
  const [townsList, setTownsList] = useState([]);

  useEffect(() => {
    if (window.api?.getTowns) {
      window.api.getTowns().then((data) => {
        if (Array.isArray(data)) {
          setTownsList(data.map((t) => t.Town_Name).filter(Boolean));
        }
      }).catch(() => {});
    }
  }, []);

  const handleRoleClick = (role) => {
    setTempRole(role === tempRole ? null : role);
  };

  const handleContinue = () => {
    if (!tempRole) return;
    setAnimating(true);
    setError('');
    setLoginEmail('');
    setLoginPassword('');
    setFormMode('login');
    setRegStep(1);
    setWizStep(1);
    setTempRole(null);
    setTimeout(() => {
      setSelectedRole(tempRole);
      setAnimating(false);
    }, 50);
  };

  const handleBack = () => {
    setAnimating(true);
    setTimeout(() => {
      setSelectedRole(null);
      setTempRole(null);
      setAnimating(false);
    }, 50);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn(loginEmail, loginPassword);
      if (!result.success) {
        throw new Error(result.error || 'Invalid email or password');
      }

      let { data: profile } = await supabase
        .from('users')
        .select('role, is_active, agent_town, agent_towns, town_name, town_id')
        .eq('id', result.user.id)
        .single();

      if (!profile) {
        const { error: insertErr } = await supabase.from('users').insert([{
          id: result.user.id,
          email: loginEmail,
          full_name: loginEmail.split('@')[0],
          role: selectedRole,
          is_active: selectedRole === 'ceo',
        }]);
        if (!insertErr) {
          profile = { role: selectedRole, is_active: selectedRole === 'ceo' };
        }
      }

      if (!profile) throw new Error('User profile not found. Try registering first.');

      if (profile.role !== selectedRole && selectedRole === 'ceo') {
        const { error: fixErr } = await supabase
          .from('users')
          .update({ role: 'ceo', is_active: true })
          .eq('id', result.user.id);
        if (!fixErr) {
          profile.role = 'ceo';
          profile.is_active = true;
        }
      }

      if (profile.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error(`This account is not registered as ${ROLE_STYLES[selectedRole].label}`);
      }
      if (selectedRole !== 'ceo' && !profile.is_active) {
        if (selectedRole === 'agent') {
          setRegUserId(result.user.id);
          setRegEmail(loginEmail);
          setRegPassword(loginPassword);
          setRegTown(profile.agent_town || profile.agent_towns || '');
          setFormMode('register');
          setRegStep(2);
          setError('');
          return;
        }
        throw new Error('Account not yet activated. Contact CEO for approval.');
      }
      if (selectedRole === 'accountant' && !(profile.town_name || profile.town_id)) {
        await supabase.auth.signOut();
        throw new Error('No town assigned to this accountant. CEO must assign a town first.');
      }
      if (window.api?.configureFileSyncContext) {
        await window.api.configureFileSyncContext({
          role: selectedRole,
          userId: result.user.id,
          accountantTown: profile.town_name || profile.town_id || '',
        }).catch(() => {});
      }
      onLogin(selectedRole, {
        townName: profile.town_name || profile.town_id || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateOtp = () => Math.random().toString().substring(2, 8);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const meta = {
        full_name: regName,
        phone_number: regPhone,
        role: selectedRole,
        agent_town: selectedRole === 'agent' ? regTown : null,
      };

      const { data: authData, error: authError } = await auth.signUp({
        email: regEmail,
        password: regPassword,
        options: { data: meta },
      });
      if (authError) throw authError;

      const userId = authData.user.id;
      setRegUserId(userId);

      const { error: profileError } = await supabase.from('users').insert([{
        id: userId,
        email: regEmail,
        full_name: regName,
        phone_number: regPhone,
        role: selectedRole,
        agent_town: selectedRole === 'agent' ? regTown : null,
        agent_towns: selectedRole === 'agent' ? regTown : null,
        is_active: selectedRole === 'accountant',
      }]);
      if (profileError) {
        console.warn('Profile insert (non-critical):', profileError.message);
      }

      if (selectedRole === 'agent') {
        const otpCode = generateOtp();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        const { data: otpRecord, error: otpError } = await supabase
          .rpc('create_agent_registration_appeal', {
            p_user_id: userId,
            p_otp_code: otpCode,
            p_otp_expires_at: expiresAt.toISOString(),
          });

        if (otpError) {
          console.warn('Registration RPC warning, trying direct appeal insert:', otpError.message);
          const { data: fallbackAppeal, error: fallbackError } = await supabase
            .from('appeals')
            .upsert([{
              requested_by_user_id: userId,
              requested_by_role: 'agent',
              appeal_type: 'agent_registration',
              entity_type: 'agent',
              entity_id: userId,
              requested_data: {
                townName: regTown,
                agent_town: regTown,
                agent_towns: regTown,
                email: regEmail,
                full_name: regName,
                phone_number: regPhone,
              },
              reason: `Agent registration approval request for ${regTown}`,
              status: 'pending',
              otp_code: otpCode,
              otp_expires_at: expiresAt.toISOString(),
            }], { onConflict: 'requested_by_user_id,entity_id,appeal_type' })
            .select('id')
            .single();
          if (fallbackError) throw new Error('Approval request setup failed: ' + fallbackError.message);
        } else {
          if (otpRecord?.id) {
            await supabase.from('appeals').update({
              requested_data: {
                townName: regTown,
                agent_town: regTown,
                agent_towns: regTown,
                email: regEmail,
                full_name: regName,
                phone_number: regPhone,
              },
              reason: `Agent registration approval request for ${regTown}`,
            }).eq('id', otpRecord.id);
          }
        }

        setRegStep(2);
      } else {
        onLogin(selectedRole);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRole !== 'agent' || regStep !== 2 || !regUserId) return;
    const channel = supabase
      .channel(`agent-approval-wait-${regUserId}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${regUserId}`,
        },
        async (payload) => {
          if (!payload.new?.is_active) return;
          try {
            if (regEmail && regPassword) {
              await auth.signInWithPassword({ email: regEmail, password: regPassword });
            }
          } catch (_) {}
          onLogin('agent', 'CEO approved your account. Agent dashboard is now available.');
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRole, regStep, regUserId, regEmail, regPassword, onLogin]);

  const nextWizStep = () => {
    if (wizStep < 3) setWizStep(wizStep + 1);
  };

  const prevWizStep = () => {
    if (wizStep > 1) setWizStep(wizStep - 1);
  };

  const handleWizKeyDown = (e) => {
    if (e.key === 'Enter' && wizStep < 3) {
      e.preventDefault();
      nextWizStep();
    }
  };

  // ─── ROLE SELECTION SCREEN ──────────────────────────────────────────────
  if (!selectedRole) {
    return (
      <div className="auth-screen">
        <div className="auth-screen-bg" />
        <div className={`auth-container ${animating ? 'auth-exit' : 'auth-enter'}`}>
          <div className="auth-brand">
            <div className="auth-logo-wrap">
              <img src={logoSrc} alt="Logo" className="auth-logo-img" />
            </div>
            <h1 className="auth-title">Please select your role</h1>
            <p className="auth-subtitle">Choose the role that matches your responsibility to access the right dashboard.</p>
          </div>

          <div className="auth-roles">
            {Object.entries(ROLE_STYLES).map(([key, role]) => {
              const isSelected = tempRole === key;
              return (
                <button
                  key={key}
                  className={`auth-role-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleRoleClick(key)}
                  type="button"
                >
                  <div className="auth-role-card-inner">
                    <div className="auth-role-icon-wrap" style={{ background: role.gradient }}>
                      <span className="auth-role-icon">{React.createElement(ROLE_ICON_COMPONENTS[key], { size: 28 })}</span>
                    </div>
                    <div className="auth-role-info">
                      <span className="auth-role-label">{role.label}</span>
                      <span className="auth-role-desc">{role.desc}</span>
                    </div>
                    <div className="auth-role-badge" style={{ background: role.gradient }}>
                      {role.badge}
                    </div>
                    {isSelected && <span className="auth-role-check">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            className={`auth-continue-btn ${tempRole ? 'active' : ''}`}
            onClick={handleContinue}
            disabled={!tempRole}
            type="button"
          >
            Continue
          </button>

          <div className="auth-powered">
            POWERED BY <strong>MAHAD AND MAHDI DEVELOPERS</strong>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM SCREEN (Login / Register / OTP) ───────────────────────────────
  const roleData = ROLE_STYLES[selectedRole];
  const portalData = ROLE_PORTAL[selectedRole];

  return (
    <div className="auth-screen">
      <div className="auth-screen-bg auth-screen-bg--light" />
      <div className={`auth-split ${animating ? 'auth-exit' : 'auth-enter'}`}>
        {/* ─── LEFT PANEL ─── */}
        <div className="auth-left-panel" style={{ background: ROLE_STYLES[selectedRole].panelGradient }}>
          <div className="auth-left-decor">
            <div className="auth-deco-circle auth-deco-circle--1" />
            <div className="auth-deco-circle auth-deco-circle--2" />
            <div className="auth-deco-circle auth-deco-circle--3" />
          </div>
          <div className="auth-left-content">
            <button className="auth-back-btn" onClick={handleBack} type="button">←</button>
            <div className="auth-left-icon-wrap">
              <span className="auth-left-icon">{React.createElement(ROLE_ICON_COMPONENTS[selectedRole], { size: 40 })}</span>
            </div>
            <h2 className="auth-left-title">{portalData.title}</h2>
            <p className="auth-left-desc">{portalData.subtitle}</p>
            <div className="auth-left-footer">
              <span className="auth-left-badge" style={{ background: 'rgba(255,255,255,0.15)' }}>{roleData.badge}</span>
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className="auth-right-panel">
          <div className="auth-right-inner">
            {/* Agent Tabs */}
            {selectedRole === 'agent' && (
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${formMode === 'login' ? 'active' : ''}`}
                  onClick={() => { setFormMode('login'); setError(''); setRegStep(1); setWizStep(1); }}
                  type="button"
                >Sign In</button>
                <button
                  className={`auth-tab ${formMode === 'register' ? 'active' : ''}`}
                  onClick={() => { setFormMode('register'); setError(''); setRegStep(1); setWizStep(1); }}
                  type="button"
                >Register</button>
              </div>
            )}

            {/* ─── LOGIN FORM ─── */}
            {formMode === 'login' && (
              <div className="auth-form-wrap">
                <h3 className="auth-form-heading">Welcome Back</h3>
                <p className="auth-form-subheading">Sign in to continue</p>
                <form onSubmit={handleLogin} className="auth-form" ref={formRef}>
                  {error && <div className="auth-error">{error}</div>}
                  <div className="form-group">
                    <label>Email</label>
                    <div className="auth-input-wrap">
                      <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="your@email.com" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <div className="auth-input-wrap">
                      <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      <input type={showPassword ? 'text' : 'password'} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" required />
                      <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="auth-form-row">
                    <label className="auth-checkbox">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                      <span>Remember me</span>
                    </label>
                    <button type="button" className="auth-link-btn" onClick={() => {}}>Forgot password?</button>
                  </div>
                  <button type="submit" className="auth-submit-btn" disabled={loading}>
                    {loading ? <span className="auth-spinner" /> : 'Sign In'}
                  </button>
                </form>
              </div>
            )}

            {/* ─── REGISTER WIZARD ─── */}
            {formMode === 'register' && selectedRole === 'agent' && regStep === 1 && (
              <div className="auth-form-wrap">
                <h3 className="auth-form-heading">Create Account</h3>
                <p className="auth-form-subheading">Fill in your details to register</p>
                <div className="auth-wizard-progress">
                  {[1,2,3].map((s) => (
                    <div key={s} className={`auth-wiz-dot ${wizStep >= s ? 'active' : ''} ${wizStep > s ? 'done' : ''}`}>
                      {wizStep > s ? '✓' : s}
                    </div>
                  ))}
                  <div className="auth-wiz-line">
                    <div className="auth-wiz-line-fill" style={{ width: `${((wizStep - 1) / 2) * 100}%` }} />
                  </div>
                </div>
                <form onSubmit={handleRegister} className="auth-form" onKeyDown={handleWizKeyDown}>
                  {error && <div className="auth-error">{error}</div>}
                  {wizStep === 1 && (
                    <div className="auth-wiz-step">
                      <div className="auth-wiz-step-title">Personal Information</div>
                      <div className="form-group">
                        <label>Full Name *</label>
                        <div className="auth-input-wrap">
                          <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Enter your full name" required />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Phone Number</label>
                        <div className="auth-input-wrap">
                          <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                          <input type="tel" value={regPhone} onChange={(e) => { let val = e.target.value.replace(/[^0-9]/g, ''); if (val.length > 11) val = val.slice(0, 11); setRegPhone(val); }} placeholder="Phone (11 digits)" maxLength={11} />
                        </div>
                      </div>
                    </div>
                  )}
                  {wizStep === 2 && (
                    <div className="auth-wiz-step">
                      <div className="auth-wiz-step-title">Account Information</div>
                      <div className="form-group">
                        <label>Email *</label>
                        <div className="auth-input-wrap">
                          <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
                          <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="your@email.com" required />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Password *</label>
                        <div className="auth-input-wrap">
                          <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                          <input type={showPassword ? 'text' : 'password'} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Create a strong password" required />
                          <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {wizStep === 3 && (
                    <div className="auth-wiz-step">
                      <div className="auth-wiz-step-title">Location</div>
                      <div className="form-group">
                        <label>Town *</label>
                        <div className="auth-input-wrap">
                          <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {townsList.length > 0 ? (
                            <select value={regTown} onChange={(e) => setRegTown(e.target.value)} required className="auth-select-input">
                              <option value="">Select a town...</option>
                              {townsList.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (
                            <input type="text" value={regTown} onChange={(e) => setRegTown(e.target.value)} placeholder="e.g. Lahore" required />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="auth-wiz-nav">
                    {wizStep > 1 && (
                      <button type="button" className="auth-wiz-btn auth-wiz-btn--back" onClick={prevWizStep}>← Back</button>
                    )}
                    <div style={{ flex: 1 }} />
                    {wizStep < 3 ? (
                      <button type="button" className="auth-wiz-btn auth-wiz-btn--next" onClick={nextWizStep}>
                        Next →
                      </button>
                    ) : (
                      <button type="submit" className="auth-wiz-btn auth-wiz-btn--submit" ref={submitRef} disabled={loading}>
                        {loading ? <span className="auth-spinner" /> : 'Create Account'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* ─── OTP SCREEN ─── */}
            {selectedRole === 'agent' && regStep === 2 && (
              <div className="auth-form-wrap">
                <div className="auth-otp-header">
                  <div className="auth-otp-shield"><IconShield size={32} /></div>
                  <h3 className="auth-form-heading">CEO Approval Required</h3>
                  <p className="auth-form-subheading">Your request has been sent to CEO. You cannot access the Agent Dashboard until CEO approves it.</p>
                </div>
                <div className="auth-form">
                  {error && <div className="auth-error">{error}</div>}
                  <div className="auth-pending-card">
                    <div><strong>Selected town:</strong> {regTown || 'Town not selected'}</div>
                    <div><strong>Status:</strong> Waiting for CEO approval</div>
                    <div className="auth-pending-note">This screen will continue automatically as soon as approval is received.</div>
                  </div>
                  <button type="button" className="auth-back-form-btn" onClick={() => { setRegStep(1); setError(''); setWizStep(1); }}>Back to registration</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

