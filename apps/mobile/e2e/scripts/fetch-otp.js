// Maestro script (GraalJS) : récupère le dernier code SMS envoyé à PHONE (E.164) auprès de otp-server.mjs.
// Résultat : output.otp
var base = typeof OTP_SERVER === 'undefined' ? 'http://localhost:3999' : OTP_SERVER;
var res = http.get(base + '/otp?phone=' + encodeURIComponent(PHONE));
if (!res.ok) {
  throw new Error('Aucun code SMS reçu pour ' + PHONE + ' (statut ' + res.status + ')');
}
output.otp = json(res.body).code;
