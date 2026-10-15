package app.pawquest.proximity

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the proximity sensor (the "phone is in a pocket" signal). expo-sensors has no proximity
 * sensor, so this small local module exposes it: `isAvailable()`, `start()`, `stop()` and the
 * `onProximity` event with `{ near, distanceCm, maxRangeCm }`.
 */
class PawQuestProximityModule : Module() {
  private var listener: SensorEventListener? = null

  private fun sensorManager(): SensorManager? =
    appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private fun proximitySensor(): Sensor? =
    sensorManager()?.getDefaultSensor(Sensor.TYPE_PROXIMITY)

  private fun stopListening() {
    listener?.let { sensorManager()?.unregisterListener(it) }
    listener = null
  }

  override fun definition() = ModuleDefinition {
    Name("PawQuestProximity")

    Events("onProximity")

    Function("isAvailable") {
      proximitySensor() != null
    }

    Function("maxRangeCm") {
      proximitySensor()?.maximumRange?.toDouble() ?: 0.0
    }

    Function("start") {
      val manager = sensorManager()
      val sensor = proximitySensor()
      if (manager == null || sensor == null) {
        return@Function false
      }
      stopListening()
      val maxRange = sensor.maximumRange
      val next = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
          val distance = event.values[0]
          // Most phones report only two values (e.g. 0 and 8): "near" is anything below the max.
          sendEvent(
            "onProximity",
            mapOf(
              "near" to (distance < maxRange),
              "distanceCm" to distance.toDouble(),
              "maxRangeCm" to maxRange.toDouble()
            )
          )
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
      }
      listener = next
      manager.registerListener(next, sensor, SensorManager.SENSOR_DELAY_NORMAL)
      true
    }

    Function("stop") {
      stopListening()
    }

    OnDestroy {
      stopListening()
    }
  }
}
