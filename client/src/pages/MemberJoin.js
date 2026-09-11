import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowLeft } from 'lucide-react';
import { memberRegister, memberLogin, clearMemberError } from '../store/slices/memberAuthSlice';
import memberApi from '../utils/memberApi';
import MemberExclusionPicker from '../components/MemberExclusionPicker';

/*  MATTER — Member join / sign-in
 *  Design source: "Menu Selection Link - Gym Members.dc.html" (Organic system,
 *  MATTER light palette — navy on white, Caprasimo headings, Figtree body).
 */
const HEAD = { fontFamily: "'Caprasimo', system-ui, sans-serif" };
const BODY = { fontFamily: "'Figtree', system-ui, sans-serif" };

const MemberJoin = () => {
  const { token } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useSelector((state) => state.memberAuth);

  const [invite, setInvite] = useState(null);      // { businessName, businessType, isActive }
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(true);

  const [mode, setMode] = useState('choice');       // 'choice' | 'signup' | 'login'
  const [signup, setSignup] = useState({ name: '', email: '', dietaryExclusions: '' });
  const [loginEmail, setLoginEmail] = useState('');
  const hasSession = !!localStorage.getItem('memberToken');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await memberApi.get(`/member/auth/invite/${token}`);
        if (alive) setInvite(res.data.data);
      } catch (err) {
        if (alive) setInviteError(err.response?.data?.message || 'This invite link is invalid.');
      } finally {
        if (alive) setInviteLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const goMode = (next) => { dispatch(clearMemberError()); setMode(next); };

  const submitSignup = async (e) => {
    e.preventDefault();
    const res = await dispatch(memberRegister({ inviteToken: token, ...signup }));
    if (memberRegister.fulfilled.match(res)) navigate('/member/portal');
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    const res = await dispatch(memberLogin({ inviteToken: token, email: loginEmail }));
    if (memberLogin.fulfilled.match(res)) navigate('/member/portal');
  };

  const field =
    'w-full min-h-[46px] px-3.5 py-2.5 rounded-full border border-[#dde4f0] bg-white text-[#051747] text-[15px] ' +
    'placeholder-[#8e9bb8] outline-none focus:border-[#1b60b4] transition-colors';
  const label = 'block text-[12px] text-[#4a5a7d] mb-1.5';
  const primaryBtn =
    'w-full rounded-full bg-[#051747] text-white py-3.5 text-[15px] font-semibold hover:bg-[#050f2b] transition-colors ' +
    'disabled:opacity-50 flex items-center justify-center gap-2';
  const secondaryBtn =
    'w-full rounded-full border border-[#dde4f0] text-[#051747] py-3.5 text-[15px] font-semibold hover:bg-[#f7f9fd] transition-colors';

  return (
    <div className="min-h-screen bg-white flex items-start justify-center px-5 py-10" style={BODY}>
      <div className="w-full max-w-[420px]">
        <img src="/images/matter-logo-navy.svg" alt="MATTER" className="h-7 mb-8" onError={(e) => { e.currentTarget.style.display = 'none'; }} />

        {inviteLoading && (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#1b60b4]" /></div>
        )}

        {!inviteLoading && inviteError && (
          <div className="rounded-2xl px-4 py-3 text-[14px] bg-[#eef5ff] text-[#1b60b4] border border-[#b8d9ff]">
            {inviteError}
          </div>
        )}

        {!inviteLoading && invite && !invite.isActive && (
          <div className="rounded-2xl px-4 py-3 text-[14px] text-[#4a5a7d] bg-[#f7f9fd] border border-[#dde4f0]">
            {invite.businessName} isn’t accepting new members right now.
          </div>
        )}

        {!inviteLoading && invite && invite.isActive && (
          <>
            {hasSession && mode === 'choice' && (
              <button onClick={() => navigate('/member/portal')} className={`${secondaryBtn} mb-4`}>
                Continue to your portal →
              </button>
            )}

            <AnimatePresence mode="wait">
              {mode === 'choice' && (
                <motion.div key="choice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-block bg-[#f6fde9] text-[#2a3f13] font-semibold text-[12px] px-3 py-1 rounded-full mb-4">
                    {invite.businessName}
                  </span>
                  <h2 className="text-[26px] text-[#051747] mb-2.5" style={HEAD}>Order meals from your gym</h2>
                  <p className="text-[#4a5a7d] text-[15px] mb-7 leading-relaxed">
                    À la carte · order any time. New here, or already have a profile?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button onClick={() => goMode('signup')} className={primaryBtn}>Sign up</button>
                    <button onClick={() => goMode('login')} className={secondaryBtn}>Log in</button>
                  </div>
                </motion.div>
              )}

              {mode === 'signup' && (
                <motion.div key="signup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button onClick={() => goMode('choice')} className="flex items-center gap-1 text-[13px] text-[#1b60b4] font-semibold mb-4">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <span className="inline-block bg-[#f6fde9] text-[#2a3f13] font-semibold text-[12px] px-3 py-1 rounded-full mb-4">
                    {invite.businessName}
                  </span>
                  <h2 className="text-[24px] text-[#051747] mb-2" style={HEAD}>Create your profile</h2>
                  <p className="text-[#4a5a7d] text-[14px] mb-6">Takes a few seconds — no password needed.</p>

                  <form onSubmit={submitSignup} className="space-y-4">
                    {error && <div className="rounded-2xl px-4 py-3 text-[13px] bg-[#fff2eb] text-[#8c491a] border border-[#ffe1d0]">{error}</div>}
                    <div>
                      <label className={label}>Full name</label>
                      <input required value={signup.name}
                        onChange={(e) => { setSignup({ ...signup, name: e.target.value }); if (error) dispatch(clearMemberError()); }}
                        className={field} placeholder="Your name" />
                    </div>
                    <div>
                      <label className={label}>Email address</label>
                      <input type="email" required value={signup.email}
                        onChange={(e) => { setSignup({ ...signup, email: e.target.value }); if (error) dispatch(clearMemberError()); }}
                        className={field} placeholder="you@example.com" />
                    </div>
                    <div>
                      <label className={label}>Dietary exclusions <span className="text-[#8e9bb8]">(optional)</span></label>
                      <MemberExclusionPicker light value={signup.dietaryExclusions}
                        onChange={(next) => setSignup({ ...signup, dietaryExclusions: next })} />
                    </div>
                    <button type="submit" disabled={isLoading} className={primaryBtn}>
                      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isLoading ? 'Creating…' : 'Create profile & continue'}
                    </button>
                  </form>
                </motion.div>
              )}

              {mode === 'login' && (
                <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button onClick={() => goMode('choice')} className="flex items-center gap-1 text-[13px] text-[#1b60b4] font-semibold mb-4">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <span className="inline-block bg-[#f6fde9] text-[#2a3f13] font-semibold text-[12px] px-3 py-1 rounded-full mb-4">
                    {invite.businessName}
                  </span>
                  <h2 className="text-[24px] text-[#051747] mb-2" style={HEAD}>Welcome back</h2>
                  <p className="text-[#4a5a7d] text-[14px] mb-6">Enter the email you signed up with.</p>

                  <form onSubmit={submitLogin} className="space-y-4">
                    {error && <div className="rounded-2xl px-4 py-3 text-[13px] bg-[#fff2eb] text-[#8c491a] border border-[#ffe1d0]">{error}</div>}
                    <div>
                      <label className={label}>Email address</label>
                      <input type="email" required value={loginEmail}
                        onChange={(e) => { setLoginEmail(e.target.value); if (error) dispatch(clearMemberError()); }}
                        className={field} placeholder="you@example.com" />
                    </div>
                    <button type="submit" disabled={isLoading} className={primaryBtn}>
                      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isLoading ? 'Signing in…' : 'Log in'}
                    </button>
                    <button type="button" onClick={() => goMode('signup')} className="w-full text-[13px] text-[#4a5a7d] hover:text-[#1b60b4] transition-colors">
                      Don’t have a profile yet? Sign up
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
};

export default MemberJoin;
