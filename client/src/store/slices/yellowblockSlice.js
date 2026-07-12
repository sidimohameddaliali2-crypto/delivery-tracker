import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchYellowblockConfigStatus = createAsyncThunk(
  'yellowblock/fetchConfigStatus',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/config-status');
      return res.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to check config');
    }
  }
);

export const fetchYellowblockOrders = createAsyncThunk(
  'yellowblock/fetchOrders',
  async ({ status = 'any', limit = 50, pageInfo } = {}, { rejectWithValue }) => {
    try {
      const params = { status, limit };
      if (pageInfo) params.page_info = pageInfo;
      const res = await api.get('/yellowblock/orders', { params });
      return res.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch orders');
    }
  }
);

export const fetchYellowblockOrderDetail = createAsyncThunk(
  'yellowblock/fetchOrderDetail',
  async (orderId, { rejectWithValue }) => {
    try {
      const res = await api.get(`/yellowblock/orders/${orderId}`);
      return res.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch order');
    }
  }
);

export const fetchYellowblockProducts = createAsyncThunk(
  'yellowblock/fetchProducts',
  async ({ limit = 50, pageInfo, title } = {}, { rejectWithValue }) => {
    try {
      const params = { limit };
      if (pageInfo) params.page_info = pageInfo;
      if (title) params.title = title;
      const res = await api.get('/yellowblock/products', { params });
      return res.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch products');
    }
  }
);

export const fetchYellowblockDrivers = createAsyncThunk(
  'yellowblock/fetchDrivers',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/drivers');
      return res.data.drivers;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch drivers');
    }
  }
);

export const fetchThirdPartyCompanies = createAsyncThunk(
  'yellowblock/fetchThirdPartyCompanies',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/third-party-companies');
      return res.data.companies || [];
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch company profiles');
    }
  }
);

export const createThirdPartyCompany = createAsyncThunk(
  'yellowblock/createThirdPartyCompany',
  async ({ name, logoUrl, whatsappNumber }, { rejectWithValue }) => {
    try {
      const res = await api.post('/yellowblock/third-party-companies', { name, logoUrl, whatsappNumber });
      return res.data.company;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to create company profile');
    }
  }
);

export const fetchThirdPartyAssignments = createAsyncThunk(
  'yellowblock/fetchThirdPartyAssignments',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/third-party-assignments');
      return res.data.assignments || [];
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch third-party assignments');
    }
  }
);

export const assignOrdersToThirdParty = createAsyncThunk(
  'yellowblock/assignOrdersToThirdParty',
  async ({ companyId, orders }, { rejectWithValue, dispatch }) => {
    try {
      const res = await api.post('/yellowblock/third-party-assignments', { companyId, orders });
      dispatch(fetchThirdPartyAssignments());
      return res.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to assign orders to third-party company');
    }
  }
);

export const fetchYellowblockAssets = createAsyncThunk(
  'yellowblock/fetchAssets',
  async ({ search = '', includeInactive = false } = {}, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/assets', {
        params: { companyName: 'Yellow Block', search, includeInactive },
      });
      return res.data.assets || [];
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch assets');
    }
  }
);

export const createYellowblockAsset = createAsyncThunk(
  'yellowblock/createAsset',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.post('/yellowblock/assets', { ...payload, companyName: 'Yellow Block' });
      return res.data.asset;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to create asset');
    }
  }
);

export const updateYellowblockAsset = createAsyncThunk(
  'yellowblock/updateAsset',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/yellowblock/assets/${id}`, data);
      return res.data.asset;
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to update asset');
    }
  }
);

export const fetchYellowblockAssetUsageLogs = createAsyncThunk(
  'yellowblock/fetchAssetUsageLogs',
  async ({ assetId, limit = 100 }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/yellowblock/assets/${assetId}/usage-logs`, { params: { limit } });
      return { assetId, logs: res.data.logs || [] };
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch usage logs');
    }
  }
);

export const fetchYellowblockAssetUsageStats = createAsyncThunk(
  'yellowblock/fetchAssetUsageStats',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/yellowblock/assets-usage-stats', { params: { companyName: 'Yellow Block' } });
      return res.data.stats || { totalAssets: 0, totalUsedUnits: 0, lowStockAssets: 0 };
    } catch (error) {
      return rejectWithValue(error?.response?.data?.message || 'Failed to fetch asset stats');
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const yellowblockSlice = createSlice({
  name: 'yellowblock',
  initialState: {
    configured: null,
    orders: [],
    ordersPagination: { nextPageInfo: null, prevPageInfo: null, limit: 50 },
    selectedOrder: null,
    products: [],
    productsPagination: { nextPageInfo: null, prevPageInfo: null, limit: 50 },
    drivers: [],
    thirdPartyCompanies: [],
    thirdPartyAssignments: [],
    assets: [],
    assetUsageLogsByAssetId: {},
    assetUsageStats: { totalAssets: 0, totalUsedUnits: 0, lowStockAssets: 0 },
    loading: false,
    orderDetailLoading: false,
    productsLoading: false,
    thirdPartyLoading: false,
    thirdPartySaving: false,
    assignmentSaving: false,
    assetsLoading: false,
    assetSaving: false,
    error: null,
  },
  reducers: {
    clearSelectedOrder(state) {
      state.selectedOrder = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // config status
    builder
      .addCase(fetchYellowblockConfigStatus.fulfilled, (state, action) => {
        state.configured = action.payload.configured;
      });

    // orders list
    builder
      .addCase(fetchYellowblockOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchYellowblockOrders.fulfilled, (state, action) => {
        state.loading = false;
        state.orders = action.payload.orders || [];
        state.ordersPagination = action.payload.pagination || state.ordersPagination;
      })
      .addCase(fetchYellowblockOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to load orders';
      });

    // order detail
    builder
      .addCase(fetchYellowblockOrderDetail.pending, (state) => {
        state.orderDetailLoading = true;
        state.error = null;
      })
      .addCase(fetchYellowblockOrderDetail.fulfilled, (state, action) => {
        state.orderDetailLoading = false;
        state.selectedOrder = action.payload.order || null;
      })
      .addCase(fetchYellowblockOrderDetail.rejected, (state, action) => {
        state.orderDetailLoading = false;
        state.error = action.payload || 'Failed to load order';
      });

    // products
    builder
      .addCase(fetchYellowblockProducts.pending, (state) => {
        state.productsLoading = true;
        state.error = null;
      })
      .addCase(fetchYellowblockProducts.fulfilled, (state, action) => {
        state.productsLoading = false;
        state.products = action.payload.products || [];
        state.productsPagination = action.payload.pagination || state.productsPagination;
      })
      .addCase(fetchYellowblockProducts.rejected, (state, action) => {
        state.productsLoading = false;
        state.error = action.payload || 'Failed to load products';
      });

    // drivers
    builder
      .addCase(fetchYellowblockDrivers.fulfilled, (state, action) => {
        state.drivers = action.payload || [];
      });

    // third-party companies list
    builder
      .addCase(fetchThirdPartyCompanies.pending, (state) => {
        state.thirdPartyLoading = true;
        state.error = null;
      })
      .addCase(fetchThirdPartyCompanies.fulfilled, (state, action) => {
        state.thirdPartyLoading = false;
        state.thirdPartyCompanies = action.payload || [];
      })
      .addCase(fetchThirdPartyCompanies.rejected, (state, action) => {
        state.thirdPartyLoading = false;
        state.error = action.payload || 'Failed to load company profiles';
      });

    // create third-party company
    builder
      .addCase(createThirdPartyCompany.pending, (state) => {
        state.thirdPartySaving = true;
        state.error = null;
      })
      .addCase(createThirdPartyCompany.fulfilled, (state, action) => {
        state.thirdPartySaving = false;
        if (action.payload) {
          state.thirdPartyCompanies.unshift(action.payload);
        }
      })
      .addCase(createThirdPartyCompany.rejected, (state, action) => {
        state.thirdPartySaving = false;
        state.error = action.payload || 'Failed to create company profile';
      });

    // third-party assignments
    builder
      .addCase(fetchThirdPartyAssignments.fulfilled, (state, action) => {
        state.thirdPartyAssignments = action.payload || [];
      })
      .addCase(fetchThirdPartyAssignments.rejected, (state, action) => {
        state.error = action.payload || 'Failed to load third-party assignments';
      });

    // assign orders to third-party
    builder
      .addCase(assignOrdersToThirdParty.pending, (state) => {
        state.assignmentSaving = true;
        state.error = null;
      })
      .addCase(assignOrdersToThirdParty.fulfilled, (state) => {
        state.assignmentSaving = false;
      })
      .addCase(assignOrdersToThirdParty.rejected, (state, action) => {
        state.assignmentSaving = false;
        state.error = action.payload || 'Failed to assign orders';
      });

    // assets list
    builder
      .addCase(fetchYellowblockAssets.pending, (state) => {
        state.assetsLoading = true;
        state.error = null;
      })
      .addCase(fetchYellowblockAssets.fulfilled, (state, action) => {
        state.assetsLoading = false;
        state.assets = action.payload || [];
      })
      .addCase(fetchYellowblockAssets.rejected, (state, action) => {
        state.assetsLoading = false;
        state.error = action.payload || 'Failed to load assets';
      });

    // create asset
    builder
      .addCase(createYellowblockAsset.pending, (state) => {
        state.assetSaving = true;
        state.error = null;
      })
      .addCase(createYellowblockAsset.fulfilled, (state, action) => {
        state.assetSaving = false;
        if (action.payload) {
          state.assets.unshift(action.payload);
        }
      })
      .addCase(createYellowblockAsset.rejected, (state, action) => {
        state.assetSaving = false;
        state.error = action.payload || 'Failed to create asset';
      });

    // update asset
    builder
      .addCase(updateYellowblockAsset.pending, (state) => {
        state.assetSaving = true;
        state.error = null;
      })
      .addCase(updateYellowblockAsset.fulfilled, (state, action) => {
        state.assetSaving = false;
        const updated = action.payload;
        if (!updated) return;
        const idx = state.assets.findIndex((asset) => asset._id === updated._id);
        if (idx >= 0) {
          state.assets[idx] = updated;
        }
      })
      .addCase(updateYellowblockAsset.rejected, (state, action) => {
        state.assetSaving = false;
        state.error = action.payload || 'Failed to update asset';
      });

    // asset usage logs
    builder
      .addCase(fetchYellowblockAssetUsageLogs.fulfilled, (state, action) => {
        state.assetUsageLogsByAssetId[action.payload.assetId] = action.payload.logs || [];
      })
      .addCase(fetchYellowblockAssetUsageLogs.rejected, (state, action) => {
        state.error = action.payload || 'Failed to load asset usage logs';
      });

    // asset usage stats
    builder
      .addCase(fetchYellowblockAssetUsageStats.fulfilled, (state, action) => {
        state.assetUsageStats = action.payload || { totalAssets: 0, totalUsedUnits: 0, lowStockAssets: 0 };
      })
      .addCase(fetchYellowblockAssetUsageStats.rejected, (state, action) => {
        state.error = action.payload || 'Failed to load asset usage stats';
      });
  },
});

export const { clearSelectedOrder, clearError } = yellowblockSlice.actions;
export default yellowblockSlice.reducer;
