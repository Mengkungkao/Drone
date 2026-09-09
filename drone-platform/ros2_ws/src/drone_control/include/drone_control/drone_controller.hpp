#pragma once
#include <chrono>
#include <string>
namespace drone_control {
struct Result { bool ok; std::string error; };
class DroneController {
public:
  virtual Result connect(std::chrono::seconds timeout) = 0;
  virtual Result arm(std::chrono::seconds timeout) = 0;
  virtual Result disarm(std::chrono::seconds timeout) = 0;
  virtual Result takeoff(double altitude_m, std::chrono::seconds timeout) = 0;
  virtual Result land(std::chrono::seconds timeout) = 0;
  virtual Result setPosition(double x, double y, double z) = 0;
  virtual Result setVelocity(double vx, double vy, double vz) = 0;
  virtual ~DroneController() = default;
};
}

