import React from 'react';
import { Avatar, Badge, IconButton, Tooltip } from '@mui/material';
import { Camera } from 'lucide-react';

const DEFAULT_FALLBACK_EMAIL = 'user@example.com';
const DEFAULT_FALLBACK_NAME = 'User';

const UserAvatar = ({
  user = {},
  size = 'medium',
  editable = false,
  onEditClick,
  showStatus = false,
  className = '',
  pictureSrc,
  fallbackEmail = DEFAULT_FALLBACK_EMAIL,
  fallbackName = DEFAULT_FALLBACK_NAME,
  initialsOverride,
  sizePx
}) => {
  const safeProfile = user.profile || {};
  const safeEmail = user.email || fallbackEmail;
  const safeFirstName = safeProfile.firstName || fallbackName.split(' ')[0] || '';
  const safeLastName = safeProfile.lastName || fallbackName.split(' ')[1] || '';

  const getAvatarSize = () => {
    if (sizePx) return sizePx;
    switch (size) {
      case 'small':
        return 32;
      case 'medium':
        return 40;
      case 'large':
        return 56;
      case 'xlarge':
        return 80;
      default:
        return 40;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'busy':
        return '#F59E0B';
      case 'away':
        return '#6B7280';
      case 'offline':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getDisplayName = () => {
    if (safeFirstName && safeLastName) {
      return `${safeFirstName} ${safeLastName}`;
    }
    if (safeFirstName) return safeFirstName;
    if (safeLastName) return safeLastName;
    return safeEmail || fallbackName;
  };

  const getInitials = () => {
    if (initialsOverride) return initialsOverride.toUpperCase();
    if (safeFirstName && safeLastName) {
      return `${safeFirstName[0]}${safeLastName[0]}`.toUpperCase();
    }
    if (safeFirstName) return safeFirstName[0].toUpperCase();
    if (safeLastName) return safeLastName[0].toUpperCase();
    if (safeEmail) return safeEmail[0].toUpperCase();
    return 'U';
  };

  const getStatus = () => {
    if (user && user.isActive === false) return 'offline';
    if (user?.role === 'driver' && safeProfile.status) {
      return safeProfile.status === 'available'
        ? 'active'
        : safeProfile.status === 'busy'
          ? 'busy'
          : 'offline';
    }
    return 'active';
  };

  const getAvatarColor = (email) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
    ];
    const safeKey = email || fallbackEmail;
    const index = safeKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const resolvedAvatarSrc = pictureSrc
    ? pictureSrc
    : safeProfile.picture
      ? `http://localhost:5000/${safeProfile.picture}`
      : null;

  const avatarContent = resolvedAvatarSrc ? (
    <Avatar
      src={resolvedAvatarSrc}
      alt={getDisplayName()}
      sx={{ width: getAvatarSize(), height: getAvatarSize() }}
      className={className}
    />
  ) : (
    <Avatar
      sx={{
        width: getAvatarSize(),
        height: getAvatarSize(),
        bgcolor: getAvatarColor(safeEmail)
      }}
      className={className}
    >
      {getInitials()}
    </Avatar>
  );

  if (editable) {
    return (
      <Tooltip title="Change profile picture">
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          badgeContent={
            <IconButton
              size="small"
              sx={{
                backgroundColor: 'primary.main',
                color: 'white',
                width: 24,
                height: 24,
                '&:hover': { backgroundColor: 'primary.dark' }
              }}
              onClick={onEditClick}
            >
              <Camera sx={{ fontSize: 14 }} />
            </IconButton>
          }
        >
          {avatarContent}
        </Badge>
      </Tooltip>
    );
  }

  if (showStatus) {
    return (
      <Badge
        overlap="circular"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        variant="dot"
        sx={{
          '& .MuiBadge-badge': {
            backgroundColor: getStatusColor(getStatus()),
            color: getStatusColor(getStatus()),
            boxShadow: `0 0 0 2px white`,
            '&::after': {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              animation: 'ripple 1.2s infinite ease-in-out',
              border: '1px solid currentColor',
              content: '""',
            },
          },
          '@keyframes ripple': {
            '0%': {
              transform: 'scale(.8)',
              opacity: 1,
            },
            '100%': {
              transform: 'scale(2.4)',
              opacity: 0,
            },
          },
        }}
      >
        {avatarContent}
      </Badge>
    );
  }

  return avatarContent;
};

export default UserAvatar;
