package com.winch.tracker.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * WinchTrackingService:
 * خدمة خلفية دائمة (Foreground Service) تعمل حتى عند إغلاق الشاشة
 * وترسل إحداثيات الـ GPS للسيرفر بانتظام لاستقبال طلبات الإنقاذ في محيط الونش.
 */
class WinchTrackingService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private val CHANNEL_ID = "WinchTrackingChannel"
    private val NOTIFICATION_ID = 1001

    // قم بتغيير هذا الرابط إلى سيرفر المنصة الحقيقي
    private val SERVER_URL = "http://your-server-ip:3000/api/driver/location"
    private val DRIVER_ID = "winch-driver-native-01"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                for (location in locationResult.locations) {
                    sendLocationToServer(location)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildForegroundNotification()
        startForeground(NOTIFICATION_ID, notification)
        startLocationUpdates()
        return START_STICKY // يعيد تشغيل الخدمة تلقائياً إذا أوقفها النظام
    }

    private fun startLocationUpdates() {
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
            .setMinUpdateIntervalMillis(5000)
            .setMinUpdateDistanceMeters(10f)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        } catch (unlikely: SecurityException) {
            // Missing permissions
        }
    }

    private fun sendLocationToServer(location: Location) {
        thread {
            try {
                val url = URL(SERVER_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; utf-8")
                conn.doOutput = true

                val json = JSONObject().apply {
                    put("driverId", DRIVER_ID)
                    put("lat", location.latitude)
                    put("lng", location.longitude)
                    put("speed", location.speed)
                    put("heading", location.bearing)
                    put("accuracy", location.accuracy)
                }

                val writer = OutputStreamWriter(conn.outputStream)
                writer.write(json.toString())
                writer.flush()
                writer.close()

                val responseCode = conn.responseCode
                conn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun buildForegroundNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚚 ونش الإنقاذ: متاح للطلبات")
            .setContentText("التتبع نشط وجاري البحث عن سيارات عطلانة في نطاقك...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "تتبع ونش الإنقاذ",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "قناة إشعارات التتبع المباشر لخدمة الونش"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
