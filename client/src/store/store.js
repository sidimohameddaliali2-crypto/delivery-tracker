import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import deliverySlice from './slices/deliverySlice';
import driverSlice from './slices/driverSlice';
import reportSlice from './slices/reportSlice'
import bagSlice from './slices/bagSlice'
import driverMobileSlice from './slices/driverMobileSlice';
import userSlice from './slices/userSlice';
import deliveryChangeSlice from './slices/deliveryChangeSlice';
import eventSlice from './slices/eventSlice';
import yellowblockSlice from './slices/yellowblockSlice';
import partnerAuthSlice from './slices/partnerAuthSlice';


const isDev = process.env.NODE_ENV !== 'production';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    delivery: deliverySlice,
    driver: driverSlice,
    report: reportSlice,
    bag: bagSlice,
    driverMobile: driverMobileSlice,
    user: userSlice,
    deliveryChange: deliveryChangeSlice,
    events: eventSlice,
    yellowblock: yellowblockSlice,
    partnerAuth: partnerAuthSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: isDev ? { warnAfter: 64 } : false,
      serializableCheck: isDev
        ? {
            warnAfter: 64,
            ignoredActions: [
              'drivers/fetchDriverLocations/fulfilled',
              'drivers/updateDriverLocation/fulfilled',
            ],
            ignoredPaths: ['driver.driverLocations'],
          }
        : false,
    }),
});

export default store;