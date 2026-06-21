// =============================================================
// CardioCare AI — Patient Management
// =============================================================

// Already implemented inline in HTML files above
// This file holds reusable patient functions

function formatPatientId(id) {
  return id ? id.toUpperCase() : '—';
}

function getGenderIcon(gender) {
  return gender === 'Female' ? '👩' : '👨';
}

function getConditionClass(maxRisk) {
  if (maxRisk > 70) return 'condition-high';
  if (maxRisk > 40) return 'condition-moderate';
  return 'condition-good';
}

function getConditionText(maxRisk) {
  if (maxRisk > 70) return '⚠️ High Risk — Consult Doctor Immediately';
  if (maxRisk > 40) return '🟡 Moderate Risk — Monitor Closely';
  return '✅ Good Overall Condition';
}