import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  User
} from 'lucide-react';
import { fetchDriverById, updateDriver } from '../store/slices/driverSlice';

const DriverDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentDriver, isLoading } = useSelector(state => state.driver);
  const [activeTab, setActiveTab] = useState('today');
  const [colorDraft, setColorDraft] = useState('#000000');
  const [isSavingColor, setIsSavingColor] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchDriverById(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    if (currentDriver?.profile?.colorCode) {
      setColorDraft(currentDriver.profile.colorCode);
    }
  }, [currentDriver]);

  const handleSaveColor = async () => {
    if (!id) return;
    try {
      setIsSavingColor(true);
      await dispatch(updateDriver({ id, driverData: { colorCode: colorDraft } })).unwrap();
      dispatch(fetchDriverById(id));
    } catch (error) {
      console.error('Failed to update color', error);
      alert(error?.response?.data?.message || 'Failed to update driver color');
    } finally {
      setIsSavingColor(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading driver details...</div>
      </div>
    );
  }

  if (!currentDriver) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Driver not found</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/drivers')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {currentDriver.profile?.firstName} {currentDriver.profile?.lastName}
            </h1>
            <p className="text-gray-500">Driver Profile & Performance</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Edit Profile
          </button>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Send Message
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile & Today's Deliveries */}
        <div className="lg:col-span-1 space-y-6">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="text-center">
              <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-semibold mx-auto mb-4">
                {currentDriver.profile?.firstName?.[0]}{currentDriver.profile?.lastName?.[0]}
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {currentDriver.profile?.firstName} {currentDriver.profile?.lastName}
              </h2>
              <div className="flex items-center justify-center mt-2 space-x-4 text-sm text-gray-500">
                <div className="flex items-center">
                  <Phone className="w-4 h-4 mr-1" />
                  {currentDriver.profile?.phone || 'No phone'}
                </div>
                <div className="flex items-center">
                  <Mail className="w-4 h-4 mr-1" />
                  {currentDriver.email}
                </div>
              </div>
              <div className="mt-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  currentDriver.profile?.status === 'available' ? 'bg-green-100 text-green-800' :
                  currentDriver.profile?.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {currentDriver.profile?.status || 'offline'}
                </span>
              </div>

              <div className="mt-6 text-left">
                <p className="text-sm font-medium text-gray-700 mb-2">Sticker Color</p>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={colorDraft}
                    onChange={(e) => setColorDraft(e.target.value)}
                    className="w-12 h-12 border border-gray-300 rounded cursor-pointer"
                  />
                  <span className="font-mono text-gray-600">{colorDraft}</span>
                  <button
                    onClick={handleSaveColor}
                    disabled={isSavingColor}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingColor ? 'Saving...' : 'Save Color'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This color is used on printed stickers to highlight this driver's deliveries.
                </p>
              </div>
            </div>

            {/* KPI Metrics */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <Target className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-semibold text-blue-600">{currentDriver.kpi?.accuracyRate || 0}%</div>
                <div className="text-xs text-gray-600">Accuracy</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <Clock className="w-6 h-6 text-orange-600 mx-auto mb-1" />
                <div className="text-lg font-semibold text-orange-600">{currentDriver.kpi?.avgLateTime || 0}m</div>
                <div className="text-xs text-gray-600">Avg Late</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-lg font-semibold text-purple-600">{currentDriver.kpi?.score || 0}</div>
                <div className="text-xs text-gray-600">KPI Score</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-1" />
                <div className="text-lg font-semibold text-red-600">{currentDriver.kpi?.complaintsCount || 0}</div>
                <div className="text-xs text-gray-600">Complaints</div>
              </div>
            </div>
          </motion.div>

          {/* Today's Deliveries */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Deliveries</h3>
            <div className="space-y-3">
              {currentDriver.todayDeliveries?.map((delivery, index) => (
                <div key={delivery.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{delivery.customer}</div>
                    <div className="text-sm text-gray-500">{delivery.scheduled}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      delivery.status === 'delivered' ? 'text-green-600' :
                      delivery.status === 'on_route' ? 'text-blue-600' :
                      'text-yellow-600'
                    }`}>
                      {delivery.status.replace('_', ' ')}
                    </div>
                    {delivery.late > 0 && (
                      <div className="text-sm text-red-600">+{delivery.late}m</div>
                    )}
                  </div>
                </div>
              ))}
              {(!currentDriver.todayDeliveries || currentDriver.todayDeliveries.length === 0) && (
                <div className="text-center py-4 text-gray-500">
                  No deliveries today
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Column - Timeline */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => setActiveTab('today')}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === 'today' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                Last 30 Deliveries
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === 'performance' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                Performance Charts
              </button>
            </div>

            {/* Delivery Timeline */}
            <div className="space-y-4">
              {currentDriver.recentDeliveries?.map((delivery, index) => (
                <div key={delivery.id} className="flex items-start space-x-4 p-4 border border-gray-200 rounded-lg">
                  <div className={`w-3 h-3 rounded-full mt-2 ${
                    delivery.status === 'delivered' ? 'bg-green-500' :
                    delivery.status === 'failed' ? 'bg-red-500' :
                    'bg-yellow-500'
                  }`} />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{delivery.customer}</h4>
                        <p className="text-sm text-gray-500">
                          {new Date(delivery.date).toLocaleDateString()} • 
                          {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1)}
                        </p>
                      </div>
                      {delivery.proof.length > 0 && (
                        <div className="flex space-x-1">
                          {delivery.proof.map((proof, idx) => (
                            <button
                              key={idx}
                              className="p-1 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              <ImageIcon className="w-4 h-4 text-gray-600" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!currentDriver.recentDeliveries || currentDriver.recentDeliveries.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <User className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <div>No delivery history found</div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DriverDetail;
