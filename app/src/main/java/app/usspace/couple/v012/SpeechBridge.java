package app.usspace.couple.v012;

import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.Locale;
import java.util.Set;

/** Local Android pronunciation; course text and practice never need a network. */
public final class SpeechBridge {
    private final Activity activity;
    private final WebView webView;
    private TextToSpeech speech;
    private boolean ready;
    private boolean closed;

    public SpeechBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        speech = new TextToSpeech(activity, status -> {
            ready = status == TextToSpeech.SUCCESS;
        });
    }

    @JavascriptInterface
    public void speak(String text, String language) {
        if (text == null || text.length() == 0 || text.length() > 2000) return;
        if (!"kn-IN".equals(language) && !"ml-IN".equals(language)) return;
        activity.runOnUiThread(() -> {
            if (closed || !ready || speech == null) {
                unavailable("Pronunciation is starting. Try Hear again in a moment.");
                return;
            }
            Locale locale = Locale.forLanguageTag(language);
            int result = speech.setLanguage(locale);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                unavailable("Install the " + ("kn-IN".equals(language) ? "Kannada" : "Malayalam")
                        + " voice in Android text-to-speech settings to hear pronunciation.");
                return;
            }
            Set<Voice> voices = speech.getVoices();
            Voice offlineVoice = null;
            if (voices != null) {
                for (Voice voice : voices) {
                    if (!voice.isNetworkConnectionRequired()
                            && voice.getLocale().getLanguage().equals(locale.getLanguage())) {
                        if (offlineVoice == null || voice.getQuality() > offlineVoice.getQuality()) {
                            offlineVoice = voice;
                        }
                    }
                }
            }
            if (offlineVoice == null) {
                unavailable("Download an offline " + ("kn-IN".equals(language) ? "Kannada" : "Malayalam")
                        + " voice in Android text-to-speech settings. Written pronunciation is built in.");
                return;
            }
            speech.setVoice(offlineVoice);
            speech.setSpeechRate(0.8f);
            if (speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "usspace-pronunciation") == TextToSpeech.ERROR) {
                unavailable("This voice could not play. Written pronunciation is shown on the card.");
            }
        });
    }

    private void unavailable(String message) {
        if (!closed) webView.evaluateJavascript(
                "window.toast&&window.toast(" + JSONObject.quote(message) + ");", null);
    }

    public void close() {
        closed = true;
        ready = false;
        if (speech != null) {
            speech.stop();
            speech.shutdown();
            speech = null;
        }
    }
}
