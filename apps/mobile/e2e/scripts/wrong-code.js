// Maestro script : produit un code à 6 chiffres différent du vrai code SMS de PHONE (output.wrong).
var base = typeof OTP_SERVER === 'undefined' ? 'http://localhost:3999' : OTP_SERVER;
var res = http.get(base + '/otp?phone=' + encodeURIComponent(PHONE));
if (!res.ok) {
  throw new Error('Aucun code SMS reçu pour ' + PHONE + ' (statut ' + res.status + ')');
}
var real = json(res.body).code;
output.wrong = real === '000000' ? '111111' : '000000';
