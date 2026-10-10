// ============================================
// WhatsApp Click-to-Chat Link Generator
// ============================================

export const generateWhatsAppLink = (phone, message) => {
  if (!phone) return null;

  // Phone number clean कर
  const cleanPhone = String(phone).replace(/\D/g, '');

  if (cleanPhone.length < 10) return null;

  // India code add कर (जर 10-digit असेल तर)
  let phoneWithCode;
  if (cleanPhone.length === 10) {
    phoneWithCode = `91${cleanPhone}`;
  } else if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
    phoneWithCode = cleanPhone;
  } else {
    phoneWithCode = cleanPhone;
  }

  // URL encode message
  const encodedMessage = encodeURIComponent(message);

  return `https://wa.me/${phoneWithCode}?text=${encodedMessage}`;
};

// Open WhatsApp in new tab
export const openWhatsApp = (phone, message) => {
  const link = generateWhatsAppLink(phone, message);
  if (link) {
    window.open(link, '_blank');
    return true;
  }
  return false;
};

// Format phone for display
export const formatPhone = (phone) => {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return `+${clean}`;
};