import time
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from px4_msgs.msg import VehicleLocalPosition, VehicleStatus, BatteryStatus

class Monitor(Node):
    def __init__(self):
        super().__init__('drone_monitor')
        self.count = 0
        self.last = None
        self.status = None
        self.battery = None
        self.started = time.monotonic()
        self.declare_parameter('minimum_messages', 5)
        self.declare_parameter('timeout_seconds', 30.0)
        self.create_subscription(VehicleLocalPosition, '/fmu/out/vehicle_local_position', self.position, qos_profile_sensor_data)
        self.create_subscription(VehicleStatus, '/fmu/out/vehicle_status', lambda m: setattr(self, 'status', m), qos_profile_sensor_data)
        self.create_subscription(BatteryStatus, '/fmu/out/battery_status', lambda m: setattr(self, 'battery', m), qos_profile_sensor_data)
        self.create_timer(0.4, self.report)
    def position(self, msg):
        self.count += 1; self.last = msg
    def report(self):
        if self.last:
            armed = self.status.arming_state if self.status else 'unknown'
            remaining = self.battery.remaining if self.battery else float('nan')
            self.get_logger().info(f'local_position count={self.count} x={self.last.x:.2f} y={self.last.y:.2f} z={self.last.z:.2f} altitude={-self.last.z:.2f} armed_state={armed} battery={remaining:.2f}')
        if self.count >= self.get_parameter('minimum_messages').value:
            self.get_logger().info('TELEMETRY_VERIFIED'); rclpy.shutdown()
        elif time.monotonic()-self.started > self.get_parameter('timeout_seconds').value:
            self.get_logger().error('telemetry timeout'); rclpy.shutdown()
def main():
    rclpy.init(); node=Monitor(); rclpy.spin(node)
    if node.count < node.get_parameter('minimum_messages').value: raise SystemExit(1)

