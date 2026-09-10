import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { partnerLogin, clearPartnerError } from '../store/slices/partnerAuthSlice';

const PartnerLogin = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, partner } = useSelector((state) => state.partnerAuth);

  useEffect(() => {
    if (partner) navigate('/partner/portal');
  }, [partner, navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(partnerLogin(formData));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) dispatch(clearPartnerError());
  };

  const field =
    'w-full bg-[#0a1230] border-[1.5px] border-[#12275e] rounded-[16px] px-4 py-3 text-[#ede5de] text-sm ' +
    'placeholder-[#5b7099] outline-none focus:border-[#bcf679] transition-colors';

  return (
    <div className="min-h-screen bg-[#04102b] flex items-center justify-center px-5"
      style={{ fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-[400px] bg-[#050f2b] border border-[#12275e] rounded-[28px] p-7"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[13px] bg-[#bcf679] text-[#051747] flex items-center justify-center text-xl"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}>M</div>
          <div>
            <div className="text-[#ede5de] text-[19px] leading-tight" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
              Partner portal
            </div>
            <div className="text-[12px] text-[#a8ccf5] mt-0.5">Café &amp; gym partner access</div>
          </div>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-[14px] px-4 py-3 text-[13px]"
              style={{ background: 'rgba(255,59,0,.14)', border: '1.5px solid rgba(255,59,0,.4)', color: '#ff8a66' }}
            >
              {error}
            </motion.div>
          )}

          <div>
            <label htmlFor="email" className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#a8ccf5] mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className={field}
              placeholder="you@business.ae"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#a8ccf5] mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={handleChange}
                className={field + ' pr-11'}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#a8ccf5] hover:text-[#bcf679] transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-[#bcf679] text-[#051747] py-3.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default PartnerLogin;
