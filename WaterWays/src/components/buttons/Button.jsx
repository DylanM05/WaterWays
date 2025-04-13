import React from 'react';


const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md',
  className = '',
  ...props 
}) => {
  

  const baseStyle = {
    borderRadius: '4px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  

  const sizeStyles = {
    sm: { padding: '4px 12px', fontSize: '0.875rem' },
    md: { padding: '8px 16px', fontSize: '1rem' },
    lg: { padding: '12px 24px', fontSize: '1.125rem' }
  };
  

  const getVariantStyle = (variant) => {
    switch(variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--primary-colour)',
          color: 'var(--primary-text-colour)',
          border: 'none',
        };
      case 'secondary':
        return {
          backgroundColor: 'var(--secondary-colour)',
          color: 'var(--primary-text-colour)',
          border: 'none',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--primary-colour)',
          border: '1px solid var(--primary-colour)',
        };
      default:
        return {
          backgroundColor: 'var(--primary-colour)',
          color: 'var(--primary-text-colour)',
          border: 'none',
        };
    }
  };
  

  const handleMouseOver = (e) => {
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = 'var(--hover-colour)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.backgroundColor = 'var(--hover-colour)';
    } else if (variant === 'outline') {
      e.currentTarget.style.backgroundColor = 'var(--primary-colour)';
      e.currentTarget.style.color = 'var(--primary-text-colour)';
    }
  };
  
  const handleMouseOut = (e) => {
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = 'var(--primary-colour)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.backgroundColor = 'var(--secondary-colour)';
    } else if (variant === 'outline') {
      e.currentTarget.style.backgroundColor = 'transparent';
      e.currentTarget.style.color = 'var(--primary-colour)';
    }
  };
  

  const style = {
    ...baseStyle,
    ...sizeStyles[size],
    ...getVariantStyle(variant),
  };
  
  return (
    <button
      onClick={onClick}
      style={style}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;