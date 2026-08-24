import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { createDriver, clearError, clearSuccess } from '../store/slices/driverSlice';
import { uploadPhoto } from '../utils/fileUpload';

const DEFAULT_COLOR = '#000000';

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  licenseNumber: '',
  licenseExpiry: '',
  nationalId: '',
  status: 'available',
  assignedZone: '',
  shiftTiming: '',
  vehicleId: '',
  vehicleType: '',
  baseSalary: '',
  contractType: 'full_time',
  joiningDate: ''
};

const CreateDriver = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.driver);
  const drivers = useSelector((state) => state.driver.drivers);
  const driversArray = Array.isArray(drivers) ? drivers : (drivers?.data || drivers?.drivers || []);

  const zoneOptions = React.useMemo(() => {
    const zones = new Set();
    driversArray.forEach((d) => {
      const z = d?.profile?.assignedZone?.trim();
      if (z) zones.add(z);
    });
    return Array.from(zones).sort((a, b) => a.localeCompare(b));
  }, [driversArray]);

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  const [vehiclePaperFile, setVehiclePaperFile] = useState(null);
  const [vehiclePaperPreview, setVehiclePaperPreview] = useState(null);
  const [uploadingVehiclePaper, setUploadingVehiclePaper] = useState(false);
  const vehiclePaperInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (error) {
      dispatch(clearError());
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, photo: 'File size must be less than 5MB' }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, photo: 'Please select an image file' }));
      return;
    }

    setPhotoFile(file);
    setErrors((prev) => ({ ...prev, photo: '' }));

    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleVehiclePaperChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, vehiclePaper: 'File size must be less than 5MB' }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, vehiclePaper: 'Please upload an image (photo or scan of the document)' }));
      return;
    }

    setVehiclePaperFile(file);
    setErrors((prev) => ({ ...prev, vehiclePaper: '' }));

    const reader = new FileReader();
    reader.onload = (ev) => setVehiclePaperPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const trimmedName = formData.fullName.trim().replace(/\s+/g, ' ');
    const spaceIndex = trimmedName.indexOf(' ');
    const firstName = spaceIndex === -1 ? trimmedName : trimmedName.slice(0, spaceIndex);
    const lastName = spaceIndex === -1 ? '' : trimmedName.slice(spaceIndex + 1);

    try {
      let pictureUrl;
      if (photoFile) {
        setUploadingPhoto(true);
        try {
          pictureUrl = await uploadPhoto(photoPreview);
        } finally {
          setUploadingPhoto(false);
        }
      }

      let vehiclePaperUrl;
      if (vehiclePaperFile) {
        setUploadingVehiclePaper(true);
        try {
          vehiclePaperUrl = await uploadPhoto(vehiclePaperPreview);
        } finally {
          setUploadingVehiclePaper(false);
        }
      }

      await dispatch(createDriver({
        firstName,
        lastName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        status: formData.status,
        colorCode: DEFAULT_COLOR,
        picture: pictureUrl,
        licenseNumber: formData.licenseNumber || undefined,
        licenseExpiry: formData.licenseExpiry || undefined,
        nationalId: formData.nationalId || undefined,
        assignedZone: formData.assignedZone || undefined,
        shiftTiming: formData.shiftTiming || undefined,
        vehicleId: formData.vehicleId || undefined,
        vehicleType: formData.vehicleType || undefined,
        vehiclePaper: vehiclePaperUrl,
        baseSalary: formData.baseSalary ? Number(formData.baseSalary) : undefined,
        contractType: formData.contractType || undefined,
        joiningDate: formData.joiningDate || undefined
      })).unwrap();

      dispatch(clearSuccess());
      navigate('/drivers');

    } catch (err) {
      setErrors((prev) => ({ ...prev, photo: err?.message && photoFile ? err.message : prev.photo }));
    }
  };

  const inputCls = (field) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      errors[field] ? 'border-red-500' : 'border-gray-300'
    }`;

  return (
    <div className="matter-analytics p-6 max-w-5xl mx-auto w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Create New Driver</h1>
          <p className="text-sm text-gray-500 mt-1">Add a new driver profile with contact, license and employment details.</p>
        </div>
        <button
          onClick={() => navigate('/drivers')}
          className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <motion.form
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        {/* Profile Information */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Profile Information</h3>
          <p className="text-xs text-gray-500 mb-4">Basic contact and identification details.</p>

          <div className="flex gap-4 mb-4">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden hover:bg-gray-50 transition-colors"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-gray-400 text-[24px]">photo_camera</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Upload Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {errors.photo && <p className="text-[11px] text-red-600">{errors.photo}</p>}
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                className={inputCls('fullName')}
              />
              {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="john.doe@example.com"
                className={inputCls('email')}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className={inputCls('phone')}
              />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>
          </div>
        </div>

        {/* Account Access */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Account Access</h3>
          <p className="text-xs text-gray-500 mb-4">Login credentials for the driver app.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••"
                className={inputCls('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••"
                className={inputCls('confirmPassword')}
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
            </div>
          </div>
        </div>

        {/* License & Identification */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">License & Identification</h3>
          <p className="text-xs text-gray-500 mb-4">Legal driving documents.</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Driving License Number</label>
              <input
                type="text"
                name="licenseNumber"
                value={formData.licenseNumber}
                onChange={handleChange}
                placeholder="DL-XXXX-XXXX"
                className={inputCls('licenseNumber')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">License Expiry Date</label>
              <input
                type="date"
                name="licenseExpiry"
                value={formData.licenseExpiry}
                onChange={handleChange}
                className={inputCls('licenseExpiry')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">National ID</label>
              <input
                type="text"
                name="nationalId"
                value={formData.nationalId}
                onChange={handleChange}
                placeholder="ID-XXXX-XXXX"
                className={inputCls('nationalId')}
              />
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Employment Details</h3>
          <p className="text-xs text-gray-500 mb-4">Operational assignments and scheduling.</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Driver Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={inputCls('status')}
              >
                <option value="available">Active</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Zone</label>
              <input
                type="text"
                name="assignedZone"
                list="zone-options"
                value={formData.assignedZone}
                onChange={handleChange}
                placeholder="Select Zone"
                className={inputCls('assignedZone')}
              />
              <datalist id="zone-options">
                {zoneOptions.map((z) => <option key={z} value={z} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Shift Timing</label>
              <select
                name="shiftTiming"
                value={formData.shiftTiming}
                onChange={handleChange}
                className={inputCls('shiftTiming')}
              >
                <option value="">Select Shift</option>
                <option value="morning">Morning (6AM–2PM)</option>
                <option value="afternoon">Afternoon (2PM–10PM)</option>
                <option value="night">Night (10PM–6AM)</option>
                <option value="flexible">Flexible / Full Day</option>
              </select>
            </div>
          </div>
        </div>

        {/* Vehicle */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Vehicle</h3>
          <p className="text-xs text-gray-500 mb-4">Assigned vehicle and registration document.</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle Type</label>
              <select
                name="vehicleType"
                value={formData.vehicleType}
                onChange={handleChange}
                className={inputCls('vehicleType')}
              >
                <option value="">Select Type</option>
                <option value="bike">Bike</option>
                <option value="van">Van</option>
                <option value="car">Car</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle ID</label>
              <input
                type="text"
                name="vehicleId"
                value={formData.vehicleId}
                onChange={handleChange}
                placeholder="e.g. DXB-A-12345"
                className={inputCls('vehicleId')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle Registration Paper</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => vehiclePaperInputRef.current?.click()}
                  className="w-16 h-16 flex-shrink-0 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden hover:bg-gray-50 transition-colors"
                >
                  {vehiclePaperPreview ? (
                    <img src={vehiclePaperPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-gray-400 text-[24px]">description</span>
                  )}
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => vehiclePaperInputRef.current?.click()}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Upload Document
                  </button>
                  <p className="text-[11px] text-gray-500 mt-0.5">Photo or scan, JPG/PNG, max 5MB</p>
                  {errors.vehiclePaper && <p className="text-[11px] text-red-600 mt-0.5">{errors.vehiclePaper}</p>}
                </div>
                <input
                  ref={vehiclePaperInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleVehiclePaperChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Salary & Contract */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Salary & Contract</h3>
          <p className="text-xs text-gray-500 mb-4">Financial and agreement details.</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Base Salary (AED)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">AED</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="baseSalary"
                  value={formData.baseSalary}
                  onChange={handleChange}
                  placeholder="0.00"
                  className={`${inputCls('baseSalary')} pl-11`}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contract Type</label>
              <select
                name="contractType"
                value={formData.contractType}
                onChange={handleChange}
                className={inputCls('contractType')}
              >
                <option value="full_time">Full-Time</option>
                <option value="part_time">Part-Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Joining Date</label>
              <input
                type="date"
                name="joiningDate"
                value={formData.joiningDate}
                onChange={handleChange}
                className={inputCls('joiningDate')}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-1 pb-4">
          <button
            type="button"
            onClick={() => navigate('/drivers')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isLoading || uploadingPhoto || uploadingVehiclePaper}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || uploadingPhoto || uploadingVehiclePaper}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            {uploadingPhoto ? 'Uploading photo…' : uploadingVehiclePaper ? 'Uploading document…' : isLoading ? 'Creating…' : 'Create Driver'}
          </button>
        </div>
      </motion.form>
    </div>
  );
};

export default CreateDriver;
