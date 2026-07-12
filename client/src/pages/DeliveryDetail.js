import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Target, 
  AlertTriangle,
  Image as ImageIcon,
  User,
  Calendar,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Tag,
  Map,
  FlagTriangleRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Timer,
  Archive,
  Upload
} from 'lucide-react';
import { fetchDeliveryById } from '../store/slices/deliverySlice';
import api from '../utils/api';
import DriverSelectModal from '../components/DriverSelectModal';
import UserAvatar from '../components/users/UserAvatar';
import IssueReportModal from '../components/IssueReportModal';
import AutoAssignButton from '../components/AutoAssignButton';

const API_BASE_URL = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
const FALLBACK_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiPkltYWdlIHVuYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';

const resolveImageUrl = (imageEntry) => {
  if (!imageEntry) return '';

  let url = imageEntry;
  if (typeof imageEntry === 'object') {
    url = imageEntry.url || imageEntry.path || imageEntry.secureUrl || imageEntry.location || '';
  }

  if (!url) return '';

  const trimmedUrl = url.toString().trim();
  if (!trimmedUrl) return '';

  if (trimmedUrl.startsWith('data:')) {
    return trimmedUrl;
  }

  const preferHttps = (value) => {
    if (!value) return '';
    if (/^https:\/\//i.test(value)) return value;
    if (/^http:\/\//i.test(value)) {
      return value.replace(/^http:\/\//i, 'https://');
    }
    return value;
  };

  if (trimmedUrl.startsWith('//')) {
    return `https:${trimmedUrl}`;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return preferHttps(trimmedUrl);
  }

  if (trimmedUrl.startsWith('/')) {
    const baseOrigin =
      API_BASE_URL ||
      (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    if (baseOrigin) {
      return preferHttps(`${baseOrigin}${trimmedUrl}`);
    }
    return preferHttps(`https://${trimmedUrl.replace(/^\/+/, '')}`);
  }

  if (API_BASE_URL) {
    try {
      const absoluteFromBase = new URL(trimmedUrl, API_BASE_URL);
      return preferHttps(absoluteFromBase.toString());
    } catch {
      // ignore errors and fall back to original url below
    }
  }

  if (/^[\w.-]+(?::\d+)?(\/.*)?$/i.test(trimmedUrl)) {
    return preferHttps(`https://${trimmedUrl}`);
  }

  return preferHttps(trimmedUrl);
};

// Inline sub-component: handles "Mark as Collected" with photo upload
const CollectButton = ({ deliveryId, actionLoading, setActionLoading, onSuccess }) => {
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setActionLoading(true);
    try {
      const formData = new FormData();
      if (photoFile) formData.append('proofImage', photoFile);
      if (notes) formData.append('notes', notes);
      await api.post(`/deliveries/${deliveryId}/collect`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowModal(false);
      onSuccess();
      alert('Collection marked as collected');
    } catch (err) {
      console.error('Collect error:', err);
      alert(err?.response?.data?.message || 'Failed to mark as collected');
    } finally {
      setIsSubmitting(false);
      setActionLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={actionLoading}
        className={`w-full flex items-center justify-center px-4 py-2 rounded-lg ${actionLoading ? 'bg-gray-300 text-gray-700' : 'bg-teal-500 text-white hover:bg-teal-600'}`}
      >
        <Archive className="w-4 h-4 mr-2" />
        Mark as Collected
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Mark as Collected</h3>
            <p className="text-sm text-gray-500">Upload a photo as proof of collection (required).</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo Proof *</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="w-full text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2"
              />
              {photoPreview && (
                <img src={photoPreview} alt="Preview" className="mt-2 w-full h-40 object-cover rounded-lg border border-gray-200" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                placeholder="Any notes about the collection..."
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !photoFile}
                className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Submitting...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Confirm Collected</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const DeliveryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { currentDelivery, currentDeliveryBags, isLoading, error } = useSelector(state => state.delivery);
  const [activeTab, setActiveTab] = useState('details');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showIssueReportModal, setShowIssueReportModal] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: '',
    customerPhone: '',
    address: '',
    company: 'Matter',
    notes: '',
    zone: '',
    date: '',
    time: ''
  });
  const [customerLocation, setCustomerLocation] = useState(null);
  const auth = useSelector(state => state.auth);

  const handleBackNavigation = () => {
    const returnTo = location.state?.returnTo;
    if (returnTo) {
      navigate(returnTo);
      return;
    }

    const canGoBack = typeof window !== 'undefined' && window.history.length > 1;
    if (canGoBack) {
      navigate(-1);
    } else {
      navigate('/deliveries');
    }
  };
  
  useEffect(() => {
    if (id) {
      // Log the request attempt
      console.log('Fetching delivery:', id);
      console.log('Auth state:', {
        isAuthenticated: !!auth.token,
        user: auth.user
      });
      dispatch(fetchDeliveryById(id))
        .unwrap()
        .then(response => {
          console.log('Delivery fetch success:', response);
        })
        .catch(error => {
          console.error('Delivery fetch error details:', {
            message: error.message,
            status: error.status,
            data: error.data,
            stack: error.stack,
            originalError: error
          });
        });
    }
  }, [dispatch, id, auth]);

  useEffect(() => {
    if (currentDelivery) {
      const dt = currentDelivery.scheduledTime ? new Date(currentDelivery.scheduledTime) : null;
      const pad2 = (n) => String(n).padStart(2, '0');
      // Use local time methods to display in user's timezone
      const localDate = dt ? `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}` : '';
      const localTime = dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : '';
      setEditForm({
        customerName: currentDelivery.customerName || '',
        customerPhone: currentDelivery.customerPhone || '',
        address: currentDelivery.address || '',
        company: currentDelivery.company || 'Matter',
        notes: currentDelivery.notes || '',
        zone: currentDelivery.zone || '',
        date: localDate,
        time: localTime
      });
    }
  }, [currentDelivery]);

  // For Collections with no address, fetch from customer's last delivery
  useEffect(() => {
    if (
      currentDelivery?.type === 'Collection' &&
      !currentDelivery.address &&
      currentDelivery.customerId
    ) {
      api.get(`/customers/${encodeURIComponent(currentDelivery.customerId)}/location`)
        .then(res => {
          const loc = res?.data?.data;
          if (loc) setCustomerLocation(loc);
        })
        .catch(() => {});
    } else {
      setCustomerLocation(null);
    }
  }, [currentDelivery]);

  // rendering logic moved down to the final return so helper functions can be declared above

  // Format date and time - use local time methods to display in user's timezone
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatStatusLabel = (status) => {
    if (!status) return 'N/A';
    return status
      .toString()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Get status color and icon
  const getStatusInfo = (status) => {
    switch (status) {
      case 'delivered':
        return { color: 'text-green-600 bg-green-100', icon: CheckCircle, label: 'Delivered' };
      case 'collected':
        return { color: 'text-teal-600 bg-teal-100', icon: Archive, label: 'Collected' };
      case 'failed':
        return { color: 'text-red-600 bg-red-100', icon: XCircle, label: 'Failed' };
      case 'picked_up':
        return { color: 'text-blue-600 bg-blue-100', icon: Truck, label: 'Picked Up' };
      case 'assigned':
        return { color: 'text-yellow-600 bg-yellow-100', icon: User, label: 'Assigned' };
      case 'pending':
      default:
        return { color: 'text-gray-600 bg-gray-100', icon: Clock, label: 'Pending' };
    }
  };

  const EARLY_WINDOW_MINUTES = 180;

  const formatDuration = (minutes = 0) => {
    const value = Math.abs(Math.round(minutes));
    if (value < 60) {
      return `${value}m`;
    }

    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return `${hours}h:${mins.toString().padStart(2, '0')}m`;
  };

  const pluralizeMinutes = (value = 0) => {
    return formatDuration(value);
  };

  const getTimingStatus = (delivery) => {
    if (!delivery) return null;

    const scheduled = delivery.scheduledTime ? new Date(delivery.scheduledTime) : null;
    const delivered = delivery.deliveredTime ? new Date(delivery.deliveredTime) : null;

    let deliveryType = delivery.deliveryType || delivery.status;
    let earlyMinutes = delivery.earlyMinutes ?? 0;
    let lateMinutes = delivery.lateMinutes ?? 0;

    if (scheduled && delivered && !Number.isNaN(scheduled.getTime()) && !Number.isNaN(delivered.getTime())) {
      const earlyCutoff = new Date(scheduled.getTime() - EARLY_WINDOW_MINUTES * 60 * 1000);
      const computedEarlyMinutes = delivered < earlyCutoff
        ? Math.max(0, Math.round((earlyCutoff - delivered) / (1000 * 60)))
        : 0;
      const diffMinutes = Math.round((delivered - scheduled) / (1000 * 60));
      const computedLateMinutes = diffMinutes > 0 ? diffMinutes : 0;

      earlyMinutes = computedEarlyMinutes;
      lateMinutes = computedLateMinutes;

      if (computedLateMinutes > 0) {
        deliveryType = 'late';
      } else if (computedEarlyMinutes > 0) {
        deliveryType = 'early';
      } else {
        deliveryType = 'on-time';
      }
    } else if (!deliveryType) {
      deliveryType = 'pending';
    }

    if (deliveryType === 'early') {
      return {
        icon: ArrowDownCircle,
        label: 'Early Delivery',
        description: `Arrived ${formatDuration(earlyMinutes)} before the window opened`,
        containerClass: 'border border-yellow-200 bg-yellow-50 text-yellow-900',
        iconClass: 'text-yellow-600',
        descriptionClass: 'text-yellow-800'
      };
    }

    if (deliveryType === 'late') {
      return {
        icon: ArrowUpCircle,
        label: 'Late Delivery',
        description: `Arrived ${formatDuration(lateMinutes)} after the scheduled time`,
        containerClass: 'border border-red-200 bg-red-50 text-red-900',
        iconClass: 'text-red-600',
        descriptionClass: 'text-red-800'
      };
    }

    if (deliveryType === 'on-time' || deliveryType === 'delivered') {
      return {
        icon: Timer,
        label: delivered ? 'On-Time Delivery' : 'On Schedule',
        description: delivered
          ? 'Delivery completed within the scheduled window'
          : 'No timing variance recorded yet',
        containerClass: 'border border-green-200 bg-green-50 text-green-900',
        iconClass: 'text-green-600',
        descriptionClass: 'text-green-800'
      };
    }

    return {
      icon: Clock,
      label: 'Timing Pending',
      description: 'Waiting for delivery completion to calculate timing',
      containerClass: 'border border-gray-200 bg-gray-50 text-gray-800',
      iconClass: 'text-gray-500',
      descriptionClass: 'text-gray-600'
    };
  };

  // Early UI guards
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading delivery details...</div>
      </div>
    );
  }

  if (!currentDelivery) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg text-red-600">{error || 'Delivery not found'}</div>
        <button
          onClick={() => dispatch(fetchDeliveryById(id))}
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(currentDelivery?.status);
  const timingStatus = getTimingStatus(currentDelivery);
  const TimingIcon = timingStatus?.icon;

  // Handler to perform reassignment when a driver id is selected from the modal
  const handleReassignDriver = async (newDriverId) => {
    if (!newDriverId) return;

    // Basic client-side validation: ensure value looks like a Mongo ObjectId
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(newDriverId)) {
      alert('Selected driver id is invalid. Reassignment cancelled.');
      console.warn('Reassign aborted: invalid driver id format:', newDriverId);
      return;
    }

    setActionLoading(true);
    try {
      const resp = await api.put(`/deliveries/${id}`, { driver: newDriverId });
      console.log('Reassign driver response:', resp?.data);
      await dispatch(fetchDeliveryById(id));
      alert('Driver reassigned');
    } catch (err) {
      console.error('Reassign driver error (axios):', err);
      const serverMessage = err?.response?.data?.message;
      const status = err?.response?.status;
      if (serverMessage) {
        alert(`Failed to reassign driver: ${serverMessage}`);
      } else if (status) {
        alert(`Failed to reassign driver (status ${status}). Check console for details.`);
      } else {
        alert(err?.message || 'Failed to reassign driver');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBackNavigation}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Delivery #{currentDelivery._id?.substring(0, 8)}...
            </h1>
            <p className="text-gray-500">{currentDelivery.customerName}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <button
            onClick={() => {
              if (!['admin','super_admin','dispatcher','manager'].includes(auth.user?.role)) {
                alert('You do not have permission to edit deliveries.');
                return;
              }
              setShowEditModal(true);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Edit Delivery
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Delivery Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery Information Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name
                </label>
                <p className="text-gray-900">{currentDelivery.customerName}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer ID
                </label>
                <p className="text-gray-900">{currentDelivery.customerId}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scheduled Time
                </label>
                <p className="text-gray-900 flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  {formatDateTime(currentDelivery.scheduledTime)}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ... existing fields ... */}
  
               <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">
                     Zone
                   </label>
                  <p className="text-gray-900 flex items-center">
    <FlagTriangleRight className="w-4 h-4 mr-2" />
    {currentDelivery.zone || 'Not specified'}
  </p>
                </div>

                <div>

                 </div>

                {currentDelivery.gpsLocation && (
                       <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                      GPS Location
                       </label>
                      <p className="text-gray-900 flex items-center">
                      <Map className="w-4 h-4 mr-2" />
                    {currentDelivery.gpsLocation.lat?.toFixed(6)}
                    <a
                        href={`${currentDelivery.gpsLocation.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-block"
                      >View on Google Maps
                        </a>
                     </p>
                     
                     </div>
                      )}
</div>

              {currentDelivery.deliveredTime && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivered Time
                  </label>
                  <p className="text-gray-900 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                    {formatDateTime(currentDelivery.deliveredTime)}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company
                </label>
                <p className="text-gray-900">{currentDelivery.company}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Type
                </label>
                <p className="text-gray-900 capitalize">{currentDelivery.type}</p>
              </div>



              {timingStatus && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timing Status
                  </label>
                  <div className={`flex items-start space-x-3 rounded-lg px-3 py-3 ${timingStatus.containerClass}`}>
                    {TimingIcon && (
                      <TimingIcon className={`w-5 h-5 mt-0.5 ${timingStatus.iconClass}`} />
                    )}
                    <div>
                      <p className="font-semibold">{timingStatus.label}</p>
                      {timingStatus.description && (
                        <p className={`text-sm ${timingStatus.descriptionClass}`}>
                          {timingStatus.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

{(currentDelivery.address || currentDelivery.type === 'Collection' || customerLocation?.address) && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {currentDelivery.type === 'Collection' ? 'Collection Address' : 'Delivery Address'}
                </label>
                <p className="text-gray-900 flex items-start">
                  <MapPin className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                  {currentDelivery.address || customerLocation?.address || <span className="text-gray-400 italic">Not specified</span>}
                </p>
                {!currentDelivery.address && customerLocation?.address && (
                  <p className="text-xs text-gray-400 mt-1 ml-6">From customer's last delivery</p>
                )}
                {currentDelivery.addressDetails && (
                  <dl className="mt-2 ml-6 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {currentDelivery.addressDetails.city && (
                      <><dt className="text-gray-500">City</dt><dd className="text-gray-800">{currentDelivery.addressDetails.city}</dd></>
                    )}
                    {currentDelivery.addressDetails.area && (
                      <><dt className="text-gray-500">Area</dt><dd className="text-gray-800">{currentDelivery.addressDetails.area}</dd></>
                    )}
                    {currentDelivery.addressDetails.street && (
                      <><dt className="text-gray-500">Street</dt><dd className="text-gray-800">{currentDelivery.addressDetails.street}</dd></>
                    )}
                    {currentDelivery.addressDetails.building && (
                      <><dt className="text-gray-500">Building</dt><dd className="text-gray-800">{currentDelivery.addressDetails.building}</dd></>
                    )}
                    {currentDelivery.addressDetails.floor && currentDelivery.addressDetails.floor !== '0' && (
                      <><dt className="text-gray-500">Floor</dt><dd className="text-gray-800">{currentDelivery.addressDetails.floor}</dd></>
                    )}
                    {currentDelivery.addressDetails.apartment && (
                      <><dt className="text-gray-500">Apartment</dt><dd className="text-gray-800">{currentDelivery.addressDetails.apartment}</dd></>
                    )}
                  </dl>
                )}
              </div>
            )}

            {currentDelivery.notes && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <p className="text-gray-900">{currentDelivery.notes}</p>
              </div>
            )}
          </motion.div>

          {/* Driver Information Card */}
          {currentDelivery.driver && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Driver Information</h2>
              
              <div className="flex items-center space-x-4">
                <UserAvatar
                  user={currentDelivery.driver}
                  sizePx={64}
                  showStatus
                  fallbackName={`${currentDelivery.driver.profile?.firstName || 'Driver'} ${currentDelivery.driver.profile?.lastName || ''}`.trim() || 'Assigned Driver'}
                  fallbackEmail={currentDelivery.driver.email || 'driver@matter.app'}
                />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {currentDelivery.driver.profile?.firstName} {currentDelivery.driver.profile?.lastName}
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                    {currentDelivery.driver.profile?.phone && (
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 mr-1" />
                        {currentDelivery.driver.profile.phone}
                      </div>
                    )}
                    {currentDelivery.driver.email && (
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-1" />
                        {currentDelivery.driver.email}
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      currentDelivery.driver.profile?.status === 'available' ? 'bg-green-100 text-green-800' :
                      currentDelivery.driver.profile?.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {currentDelivery.driver.profile?.status || 'offline'}
                    </span>
                  </div>
                </div>
              </div>

              {currentDelivery.driver.kpi && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <Target className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                    <div className="text-lg font-semibold text-blue-600">{currentDelivery.driver.kpi.accuracyRate}%</div>
                    <div className="text-xs text-gray-600">Accuracy</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <Clock className="w-6 h-6 text-orange-600 mx-auto mb-1" />
                    <div className="text-lg font-semibold text-orange-600">{currentDelivery.driver.kpi.avgLateTime}m</div>
                    <div className="text-xs text-gray-600">Avg Late</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-lg font-semibold text-purple-600">{currentDelivery.driver.kpi.score}</div>
                    <div className="text-xs text-gray-600">KPI Score</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-1" />
                    <div className="text-lg font-semibold text-red-600">{currentDelivery.driver.kpi.complaintsCount}</div>
                    <div className="text-xs text-gray-600">Complaints</div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

            {/* Bags Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              {currentDelivery.bagAssignment && (
  <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Associated Bag</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-sm text-gray-600">Bag ID</p>
        <p className="font-medium text-gray-900">{currentDelivery.bagAssignment.bagId}</p>
      </div>
      <div>
        <p className="text-sm text-gray-600">Assigned At</p>
        <p className="font-medium text-gray-900">
          {new Date(currentDelivery.bagAssignment.assignedAt).toLocaleString()}
        </p>
      </div>
      <div>
        <p className="text-sm text-gray-600">Assignment Status</p>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          currentDelivery.bagAssignment.status === 'delivered' ? 'bg-green-100 text-green-800' :
          currentDelivery.bagAssignment.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
          currentDelivery.bagAssignment.status === 'returned' ? 'bg-emerald-100 text-emerald-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {formatStatusLabel(currentDelivery.bagAssignment.status)}
        </span>
      </div>
      {currentDelivery.bagAssignment.returnedAt && (
        <div>
          <p className="text-sm text-gray-600">Returned At</p>
          <p className="font-medium text-gray-900">
            {formatDateTime(currentDelivery.bagAssignment.returnedAt)}
          </p>
        </div>
      )}
    </div>
  </div>
)}
            </motion.div>

          {/* Collection Details Card — shown only for Collection type */}
          {currentDelivery.type === 'Collection' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="bg-white rounded-lg shadow-sm border border-teal-200 p-6"
            >
              <h2 className="text-lg font-semibold text-teal-800 mb-4 flex items-center gap-2">
                <Archive className="w-5 h-5 text-teal-600" />
                Collection Details
              </h2>

              {/* Bag IDs */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Bags to Collect</p>
                {currentDelivery.collectionDetails?.bagIds?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {currentDelivery.collectionDetails.bagIds.map((bagId, i) => (
                      <span key={i} className="px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 text-sm font-mono rounded-full">
                        {bagId}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No bag IDs specified</p>
                )}
              </div>

              {/* Location */}
              {(currentDelivery.address || currentDelivery.zone || customerLocation) && (
                <div className="mb-4 border-t border-teal-100 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Collection Location
                    {!currentDelivery.address && customerLocation?.address && (
                      <span className="ml-2 text-xs font-normal text-gray-400">(from customer's last delivery)</span>
                    )}
                  </p>
                  {(currentDelivery.address || customerLocation?.address) && (
                    <p className="text-sm text-gray-700 mb-1">{currentDelivery.address || customerLocation?.address}</p>
                  )}
                  {currentDelivery.addressDetails && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1 mb-1">
                      {currentDelivery.addressDetails.city && (
                        <><dt className="text-gray-500">City</dt><dd className="text-gray-700">{currentDelivery.addressDetails.city}</dd></>
                      )}
                      {currentDelivery.addressDetails.area && (
                        <><dt className="text-gray-500">Area</dt><dd className="text-gray-700">{currentDelivery.addressDetails.area}</dd></>
                      )}
                      {currentDelivery.addressDetails.street && (
                        <><dt className="text-gray-500">Street</dt><dd className="text-gray-700">{currentDelivery.addressDetails.street}</dd></>
                      )}
                      {currentDelivery.addressDetails.building && (
                        <><dt className="text-gray-500">Building</dt><dd className="text-gray-700">{currentDelivery.addressDetails.building}</dd></>
                      )}
                      {currentDelivery.addressDetails.floor && currentDelivery.addressDetails.floor !== '0' && (
                        <><dt className="text-gray-500">Floor</dt><dd className="text-gray-700">{currentDelivery.addressDetails.floor}</dd></>
                      )}
                      {currentDelivery.addressDetails.apartment && (
                        <><dt className="text-gray-500">Apt</dt><dd className="text-gray-700">{currentDelivery.addressDetails.apartment}</dd></>
                      )}
                    </dl>
                  )}
                  {(currentDelivery.zone || customerLocation?.zone) && (
                    <p className="text-xs text-gray-500 mb-1">Zone: {currentDelivery.zone || customerLocation?.zone}</p>
                  )}
                  {(currentDelivery.gpsLocation?.link || customerLocation?.gpsLocation?.link) && (
                    <a
                      href={currentDelivery.gpsLocation?.link || customerLocation?.gpsLocation?.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-600 hover:underline"
                    >
                      📍 View on map
                    </a>
                  )}
                  {(currentDelivery.gpsLocation?.lat || customerLocation?.gpsLocation?.lat) && (
                    <p className="text-xs text-gray-400 mt-1">
                      {Number(currentDelivery.gpsLocation?.lat || customerLocation?.gpsLocation?.lat).toFixed(6)},{' '}
                      {Number(currentDelivery.gpsLocation?.lng || customerLocation?.gpsLocation?.lng).toFixed(6)}
                    </p>
                  )}
                </div>
              )}

              {currentDelivery.collectionDetails?.noBagsAvailable && (
                <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                  <p className="text-sm text-orange-800 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    No bags were available at this location.
                  </p>
                </div>
              )}

              {/* Collection status and photo */}
              {currentDelivery.status === 'collected' && currentDelivery.collectionDetails?.collectedAt && (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Collected At</p>
                    <p className="text-gray-900 flex items-center gap-2 mt-1">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      {formatDateTime(currentDelivery.collectionDetails.collectedAt)}
                    </p>
                  </div>
                  {currentDelivery.collectionDetails?.collectedPhotoUrl && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Collection Photo</p>
                      <img
                        src={resolveImageUrl(currentDelivery.collectionDetails.collectedPhotoUrl)}
                        alt="Collection proof"
                        className="w-full max-w-xs h-48 object-cover rounded-lg border border-gray-200"
                        referrerPolicy="no-referrer"
                        onError={e => {
                          if (!e.currentTarget.dataset.fallbackAttempted) {
                            e.currentTarget.dataset.fallbackAttempted = 'true';
                            e.currentTarget.src = FALLBACK_IMAGE;
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Timeline Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Timeline</h2>
            
            <div className="space-y-4">
              {currentDelivery.timeline && currentDelivery.timeline.length > 0 ? (
                currentDelivery.timeline.map((event, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className={`w-3 h-3 rounded-full mt-2 ${
                      event.status === 'delivered' ? 'bg-green-500' :
                      event.status === 'failed' ? 'bg-red-500' :
                      event.status === 'picked_up' ? 'bg-blue-500' :
                      event.status === 'assigned' ? 'bg-yellow-500' :
                      'bg-gray-500'
                    }`} />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900 capitalize">
                            {event.status.replace('_', ' ')}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {formatDateTime(event.timestamp)}
                          </p>
                        </div>
                      </div>
                      {event.notes && (
                        <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <div>No timeline events recorded</div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Column - Proof & Actions */}
        <div className="space-y-6">
          {/* Proof of Delivery Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Proof of Delivery</h2>
            
            {currentDelivery?.proof?.images?.length > 0 || currentDelivery?.proof?.photoUrl ? (
              <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Delivery Photos</p>
        <div className="grid grid-cols-2 gap-4">
          {(currentDelivery?.proof?.images || (currentDelivery?.proof?.photoUrl ? [currentDelivery.proof.photoUrl] : [])).map((imageEntry, index) => {
            const resolvedUrl = resolveImageUrl(imageEntry);
            if (!resolvedUrl) {
              return (
                <div
                  key={`proof-${index}`}
                  className="w-full h-32 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400"
                >
                  Unable to load image
                </div>
              );
            }

            const originalUrl =
              typeof imageEntry === 'string'
                ? imageEntry
                : imageEntry?.url || imageEntry?.path || imageEntry?.location || resolvedUrl;
            const fallbackUrl = originalUrl ? resolveImageUrl(originalUrl) : '';
            const fullSizeUrl = fallbackUrl || resolvedUrl;

            return (
              <div key={`proof-${index}`} className="relative">
                <img
                  src={resolvedUrl}
                  alt={`Delivery proof ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg border border-gray-200 bg-gray-100"
                  referrerPolicy="no-referrer"
                  onError={event => {
                    const el = event.currentTarget;
                    if (!el.dataset.fallbackAttempted && fallbackUrl && fallbackUrl !== resolvedUrl) {
                      el.dataset.fallbackAttempted = 'true';
                      el.src = fallbackUrl;
                    } else {
                      el.src = FALLBACK_IMAGE;
                    }
                  }}
                />
                <a
                  href={fullSizeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white p-1 rounded text-xs"
                >
                  View Full
                </a>
              </div>
            );
          })}
        </div>
      </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <div>No proof of delivery uploaded</div>
              </div>
            )}
          </motion.div>

          {/* Actions Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            
            <div className="space-y-3">
              <button
                onClick={async () => {
                  if (auth.user?.role !== 'admin') { alert('Only admins can mark deliveries as delivered'); return; }
                  if (!window.confirm('Mark this delivery as delivered?')) return;
                  setActionLoading(true);
                  try {
                    await api.put(`/deliveries/${id}`, { status: 'delivered', deliveredTime: new Date().toISOString() });
                    await dispatch(fetchDeliveryById(id));
                    alert('Delivery marked as delivered');
                  } catch (err) {
                    console.error('Mark delivered error:', err);
                    alert(err?.response?.data?.message || 'Failed to mark delivered');
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                className={`w-full flex items-center justify-center px-4 py-2 rounded-lg ${actionLoading ? 'bg-gray-300 text-gray-700' : 'bg-green-500 text-white hover:bg-green-600'}`}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Delivered
              </button>

              {/* Mark as Collected — only for Collection type */}
              {currentDelivery.type === 'Collection' && currentDelivery.status !== 'collected' && (
                ['admin', 'super_admin', 'dispatcher', 'driver'].includes(auth.user?.role)
              ) && (
                <CollectButton
                  deliveryId={id}
                  actionLoading={actionLoading}
                  setActionLoading={setActionLoading}
                  onSuccess={() => dispatch(fetchDeliveryById(id))}
                />
              )}

              <button
                onClick={() => {
                  if (auth.user?.role !== 'admin') { alert('Only admins can reassign drivers'); return; }
                  setShowDriverModal(true);
                }}
                disabled={actionLoading}
                className={`w-full flex items-center justify-center px-4 py-2 rounded-lg ${actionLoading ? 'bg-gray-300 text-gray-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
              >
                <Truck className="w-4 h-4 mr-2" />
                Reassign Driver
              </button>

              {/* AI Auto-Assign Button */}
              {(['admin', 'super_admin', 'dispatcher'].includes(auth.user?.role)) && (
                <AutoAssignButton 
                  delivery={currentDelivery} 
                  onAssignmentComplete={(updatedDelivery) => {
                    dispatch(fetchDeliveryById(currentDelivery._id));
                  }}
                />
              )}

              <button
                onClick={() => setShowIssueReportModal(true)}
                disabled={actionLoading}
                className={`w-full flex items-center justify-center px-4 py-2 rounded-lg ${actionLoading ? 'bg-gray-300 text-gray-700' : 'bg-red-500 text-white hover:bg-red-600'}`}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Report Issue
              </button>

              {currentDelivery.complaint?.hasComplaint && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center text-red-800">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    <span className="font-medium">Complaint Filed</span>
                  </div>
                  {currentDelivery.complaint.details && (
                    <p className="text-sm text-red-700 mt-1">{currentDelivery.complaint.details}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-red-600">
                      {currentDelivery.complaint.resolved ? 'Resolved' : 'Pending Resolution'}
                    </span>
                    <button className="text-xs text-red-600 hover:text-red-800">
                      {currentDelivery.complaint.resolved ? 'Reopen' : 'Mark Resolved'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      <DriverSelectModal
        isOpen={showDriverModal}
        onClose={() => setShowDriverModal(false)}
        onSelect={handleReassignDriver}
        currentDriverId={currentDelivery?.driver?._id}
      />

      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Delivery</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!['admin','super_admin','dispatcher','manager'].includes(auth.user?.role)) {
                  alert('You do not have permission to edit deliveries.');
                  return;
                }
                const updatePayload = {};
                // Basic fields
                if (editForm.customerName !== currentDelivery.customerName) updatePayload.customerName = editForm.customerName;
                if (editForm.customerPhone !== (currentDelivery.customerPhone || '')) updatePayload.customerPhone = editForm.customerPhone;
                if (editForm.address !== (currentDelivery.address || '')) updatePayload.address = editForm.address;
                if (editForm.company !== (currentDelivery.company || '')) updatePayload.company = editForm.company;
                if (editForm.notes !== (currentDelivery.notes || '')) updatePayload.notes = editForm.notes;
                if (editForm.zone !== (currentDelivery.zone || '')) updatePayload.zone = editForm.zone;

                // Scheduled time: combine local date + time if provided
                if (editForm.date && editForm.time) {
                  // Construct as UTC time since server stores it that way
                  const newIso = `${editForm.date}T${editForm.time}:00`;
                  const currentIso = currentDelivery.scheduledTime ? new Date(currentDelivery.scheduledTime).toISOString() : '';
                  const newDate = new Date(newIso + 'Z'); // Add Z to parse as UTC
                  if (newDate.toISOString() !== currentIso) {
                    updatePayload.scheduledTime = newIso; // Send without Z - server will handle timezone
                  }
                }

                if (Object.keys(updatePayload).length === 0) {
                  alert('No changes to save');
                  return;
                }

                try {
                  setActionLoading(true);
                  await api.put(`/deliveries/${id}`, updatePayload);
                  await dispatch(fetchDeliveryById(id));
                  setShowEditModal(false);
                  alert('Delivery updated successfully');
                } catch (err) {
                  console.error('Update delivery error:', err);
                  alert(err?.response?.data?.message || 'Failed to update delivery');
                } finally {
                  setActionLoading(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm(f => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    value={editForm.customerPhone}
                    onChange={(e) => setEditForm(f => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    rows={2}
                    value={editForm.address}
                    onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <select
                    value={editForm.company}
                    onChange={(e) => setEditForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Matter">Matter</option>
                    <option value="Yellow Block">Yellow Block</option>
                    <option value="CookIt">CookIt</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone (optional)</label>
                  <input
                    type="text"
                    value={editForm.zone}
                    onChange={(e) => setEditForm(f => ({ ...f, zone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Zone A"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`flex items-center px-4 py-2 rounded-lg ${actionLoading ? 'bg-gray-300 text-gray-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Report Modal */}
      <IssueReportModal
        isOpen={showIssueReportModal}
        onClose={() => setShowIssueReportModal(false)}
        onSubmit={async (issueData) => {
          setActionLoading(true);
          try {
            await api.post(`/deliveries/${id}/report-issue`, {
              complaint: {
                hasComplaint: true,
                complaintType: issueData.complaintType,
                remarks: issueData.remarks,
                compensation: issueData.compensation,
                resolved: false,
                reportedAt: new Date().toISOString()
              }
            });
            await dispatch(fetchDeliveryById(id));
            setShowIssueReportModal(false);
            alert('Issue reported successfully and sent to Slack');
          } catch (err) {
            console.error('Report issue error:', err);
            alert(err?.response?.data?.message || 'Failed to report issue');
          } finally {
            setActionLoading(false);
          }
        }}
        isLoading={actionLoading}
        deliveryInfo={currentDelivery ? {
          customerName: currentDelivery.customerName,
          customerId: currentDelivery.customerId
        } : null}
      />
    </div>
  );
};

export default DeliveryDetail;

