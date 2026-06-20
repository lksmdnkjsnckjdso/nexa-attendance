export const DEFAULT_SETTINGS = {
  loginTime: "09:00",
  logoutTime: "17:00",
  latePenaltyAmount: 500, // Rupees
};

export const ADMIN_CODE = "8637";

// Fallback to a simpler model load if needed, or use public weights
export const MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};