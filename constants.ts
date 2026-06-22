export const DEFAULT_SETTINGS = {
  loginTime: "09:00",
  logoutTime: "17:00",
  latePenaltyAmount: 500, // Rupees
};

export const ADMIN_CODE = "8637";

export const FACE_MATCH_THRESHOLD = 1.2;

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};