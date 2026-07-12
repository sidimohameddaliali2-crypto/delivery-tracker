import express from 'express';
import User from '../models/User.js';
import { protect, authorize, admin, superAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Get current user's dashboard layout
router.get('/me/dashboard-layout', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('dashboardLayout');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      dashboardLayout: user.dashboardLayout || null
    });
  } catch (error) {
    console.error('Get dashboard layout error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update current user's dashboard layout
router.put('/me/dashboard-layout', async (req, res) => {
  try {
    const { dashboardLayout } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.dashboardLayout = dashboardLayout || null;
    await user.save();

    res.json({
      message: 'Dashboard layout saved',
      dashboardLayout: user.dashboardLayout
    });
  } catch (error) {
    console.error('Save dashboard layout error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users (admin and super_admin only)
router.get('/', authorize(['super_admin', 'admin']), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .populate('createdBy', 'profile firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get drivers (accessible by all authenticated users)
// Get user by ID (users can access their own profile, admins can access any)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('createdBy', 'profile firstName lastName');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Users can only access their own profile unless they're admin/super_admin
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new user (admin and super_admin only)
router.post('/', authorize(['super_admin', 'admin']), async (req, res) => {
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      phone, 
      role, 
      department, 
      position,
      permissions,
      isActive = true 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Validate role hierarchy
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admin can create super admin users' });
    }

    const user = new User({
      email,
      password,
      role: role || 'viewer',
      profile: {
        firstName,
        lastName,
        phone,
        department,
        position
      },
      permissions: permissions || getDefaultPermissions(role),
      isActive,
      createdBy: req.user.id
    });

    await user.save();

    // Return user without password
    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('createdBy', 'profile firstName lastName');

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user (users can update their own profile, admins can update any)
router.put('/:id', async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      phone, 
      role, 
      department, 
      position,
      permissions,
      isActive 
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Role change restrictions
    if (role && role !== user.role) {
      if (req.user.role !== 'super_admin' && role === 'super_admin') {
        return res.status(403).json({ message: 'Only super admin can assign super admin role' });
      }
      
      if (user.role === 'super_admin' && req.user.id !== user._id.toString()) {
        return res.status(403).json({ message: 'Cannot change super admin role' });
      }
    }

    // Update fields
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    if (phone) user.profile.phone = phone;
    if (department) user.profile.department = department;
    if (position) user.profile.position = position;
    
    // Only admins can change role, permissions, and active status
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      if (role) user.role = role;
      if (permissions) user.permissions = permissions;
      if (isActive !== undefined) user.isActive = isActive;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('createdBy', 'profile firstName lastName');

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete user (super_admin only)
router.delete('/:id', superAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deletion
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Prevent deletion of other super_admins
    if (user.role === 'super_admin' && req.user.id !== user._id.toString()) {
      return res.status(403).json({ message: 'Cannot delete other super admin accounts' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user statistics (admin and super_admin only)
router.get('/stats/overview', authorize(['super_admin', 'admin']), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('createdBy', 'profile firstName lastName');

    res.json({
      totalUsers,
      activeUsers,
      usersByRole,
      recentUsers
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function for default permissions
function getDefaultPermissions(role) {
  const permissions = {
    dashboard: false,
    users: false,
    drivers: false,
    deliveries: false,
    customers: false,
    events: false,
    bags: false,
    late_deliveries: false,
    complaints: false,
    live_map: false,
    delivery_changes: false,
    reports: false,
    menus: false,
    settings: false,
    yellowblock: false
  };

  switch (role) {
    case 'super_admin':
      Object.keys(permissions).forEach(key => permissions[key] = true);
      break;
    case 'admin':
      permissions.dashboard = true;
      permissions.users = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.events = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.complaints = true;
      permissions.live_map = true;
      permissions.delivery_changes = true;
      permissions.reports = true;
      permissions.menus = true;
      break;
    case 'manager':
      permissions.dashboard = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.reports = true;
      permissions.live_map = true;
      break;
    case 'dispatcher':
      permissions.dashboard = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.events = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.complaints = true;
      permissions.live_map = true;
      break;
    case 'driver':
      permissions.dashboard = true;
      permissions.deliveries = true;
      break;
    case 'viewer':
      permissions.dashboard = true;
      permissions.reports = true;
      break;
    case 'yellowblock_user':
      permissions.events = true;
      permissions.yellowblock = true;
      break;
  }

  return permissions;
}

export default router;
