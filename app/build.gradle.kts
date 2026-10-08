plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

val usspaceKeystorePath = System.getenv("USSPACE_KEYSTORE_PATH")
val usspaceKeystorePassword = System.getenv("USSPACE_KEYSTORE_PASSWORD")
val usspaceKeyAlias = System.getenv("USSPACE_KEY_ALIAS") ?: "usspace"
val usspaceKeyPassword = System.getenv("USSPACE_KEY_PASSWORD") ?: usspaceKeystorePassword

android {
    namespace = "app.usspace.couple.v012"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.usspace.couple.v012"
        minSdk = 26
        targetSdk = 35
        versionCode = 16
        versionName = "0.14.0"
        manifestPlaceholders["appAuthRedirectScheme"] = "app.usspace.couple.v012"
    }

    signingConfigs {
        if (!usspaceKeystorePath.isNullOrBlank()) {
            create("usspaceStable") {
                storeFile = file(usspaceKeystorePath)
                storePassword = usspaceKeystorePassword
                keyAlias = usspaceKeyAlias
                keyPassword = usspaceKeyPassword
                storeType = "PKCS12"
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfigs.findByName("usspaceStable")?.let { signingConfig = it }
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfigs.findByName("usspaceStable")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.work:work-runtime:2.10.1")
    // Worker exposes ListenableFuture; Firebase's empty conflict artifact is not its API.
    implementation("com.google.guava:guava:33.4.8-android")
    implementation("net.openid:appauth:0.11.1")

    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
