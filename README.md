# Cafe13

## Admin sign-in

`admin/` opens only for the owner's phone number and password. Neither is stored: the panel runs
PBKDF2-SHA256 (600,000 rounds) on `phone + ":" + password` with the salt in `AUTH` (`admin/admin.js`),
compares the SHA-256 of the first 32 bytes with `AUTH.check`, and uses the other 32 bytes as the AES-GCM
key that seals the GitHub token in that browser's localStorage.

To change the phone or password, run this locally (never commit the values) and paste the two lines into `AUTH`:

```bash
python3 -c 'import hashlib,os,getpass;p=input("phone (09…): ");w=getpass.getpass("password: ");s=os.urandom(16);b=hashlib.pbkdf2_hmac("sha256",(p+":"+w).encode(),s,600000,64);print("salt",s.hex());print("check",hashlib.sha256(b[:32]).hexdigest())'
```

Signing in on any device needs only the phone and password. The GitHub token is asked **once, ever**: the panel seals it
with that same key and saves it as `admin/vault.json` in the repo (the box is ticked by default on the token screen), so a
new device unseals it by itself. The token is never stored in plain text anywhere. Notes:

- Use a long password (12+ characters): it is the only thing protecting the sealed token, and the file is public.
- Make the token fine-grained, for this repo only, with just `Contents: Read and write`, and set an expiry.
- After changing the phone or password, or when the token expires, the next sign-in asks for the token once more and
  saves a fresh `vault.json`.
