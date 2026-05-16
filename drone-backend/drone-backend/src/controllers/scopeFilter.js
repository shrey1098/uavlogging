/**
 * Shared scope filter — used by both crudBuilder and individual controllers.
 * super_admin → sees everything
 * operator    → sees only their own documents
 */
const buildScopeFilter = (user) => {
  if (user.role === 'super_admin') return {};
  return { owner: user._id };
};

module.exports = { buildScopeFilter };