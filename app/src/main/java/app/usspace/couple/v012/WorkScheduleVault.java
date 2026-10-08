package app.usspace.couple.v012;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Tokens, connection settings and own shifts stay encrypted on this phone, scoped to Firebase UID. */
final class WorkScheduleVault {
    private final SharedPreferences preferences;
    WorkScheduleVault(Context context) { preferences = context.getSharedPreferences("usspace_work_private", Context.MODE_PRIVATE); }
    private String key(String uid) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(uid.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder("usspace.work.");
        for (byte value : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", value));
        return result.toString();
    }
    private SecretKey secret(String alias) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    synchronized String read(String uid) throws Exception {
        if (uid == null || uid.isEmpty()) return "";
        String alias = key(uid), encoded = preferences.getString(alias, "");
        if (encoded == null || encoded.isEmpty()) return "";
        String[] pieces = encoded.split(":", -1);
        if (pieces.length != 2) throw new IllegalStateException("Private work data cannot be read.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret(alias), new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)));
        cipher.updateAAD(uid.getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    synchronized void write(String uid, String value) throws Exception {
        if (uid == null || uid.isEmpty()) return;
        String alias = key(uid); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secret(alias)); cipher.updateAAD(uid.getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String result = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences.edit().putString(alias, result).commit()) throw new IllegalStateException("Private work data could not be saved.");
    }
    synchronized void erase(String uid) {
        if (uid == null || uid.isEmpty()) return;
        try {
            String alias = key(uid); preferences.edit().remove(alias).commit();
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
            if (store.containsAlias(alias)) store.deleteEntry(alias);
        } catch (Exception ignored) { }
    }
}
