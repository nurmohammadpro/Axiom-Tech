export function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 14 || digits.length > 15) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function normalizeImei(input: string): string {
  return input.replace(/[^0-9]/g, "");
}
