//! MSP framing for the Phase 1 Betaflight read-only slice.
//!
//! This module is pure protocol: it does not open a serial port, enumerate devices, or
//! decide that anything is safe to talk to. It turns bytes into typed values and refuses
//! bytes it cannot account for. Every decoder here fails closed — a short, oversized or
//! unrecognised payload is an error, never a default value, because an invented gyro
//! reading or board name is worse than no reading at all.
//!
//! Only requests are encoded. There is deliberately no way to express an MSP write,
//! a CLI escape, or any command outside the read-only set Phase 1 permits.
use crate::error::{AppError, Result};

/// Betaflight accepts both framings. v2 carries a 16-bit function and a stronger checksum;
/// v1 is kept because older firmware and the identity handshake still answer on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MspVersion {
    V1,
    V2,
}

/// Read-only requests this phase is allowed to send. Naming them as an enum rather than
/// raw integers is the point: an unlisted function cannot be requested by mistake.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum MspRequest {
    ApiVersion = 1,
    FirmwareVariant = 2,
    FirmwareVersion = 3,
    BoardInfo = 4,
    RawImu = 102,
}

impl MspRequest {
    pub fn function(self) -> u16 {
        self as u16
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MspFrame {
    pub version: MspVersion,
    pub function: u16,
    pub payload: Vec<u8>,
    /// The controller answered `$M!` / `$X!`: it understood the framing and refused the
    /// request. That is a reportable answer, not a decoding failure.
    pub rejected: bool,
}

/// A frame larger than this is treated as a desynchronised stream rather than a real
/// message, so a noisy line cannot make the decoder allocate without bound.
const MAX_PAYLOAD: usize = 4096;

fn protocol(message: impl Into<String>) -> AppError {
    AppError::Protocol(message.into())
}

/// CRC-8/DVB-S2 over the v2 header and payload, as Betaflight computes it.
fn crc8_dvb_s2(seed: u8, byte: u8) -> u8 {
    let mut crc = seed ^ byte;
    for _ in 0..8 {
        crc = if crc & 0x80 != 0 { (crc << 1) ^ 0xD5 } else { crc << 1 };
    }
    crc
}

pub fn encode_request(version: MspVersion, request: MspRequest, payload: &[u8]) -> Result<Vec<u8>> {
    if payload.len() > MAX_PAYLOAD {
        return Err(protocol(format!("Request payload of {} bytes exceeds {MAX_PAYLOAD}", payload.len())));
    }
    let function = request.function();
    Ok(match version {
        MspVersion::V1 => {
            // v1 carries one byte each for size and function, so anything wider cannot be
            // expressed in this framing and must not be silently truncated.
            let size = u8::try_from(payload.len())
                .map_err(|_| protocol("MSP v1 payloads are limited to 255 bytes; use v2"))?;
            let function = u8::try_from(function)
                .map_err(|_| protocol(format!("Function {function} does not fit MSP v1; use v2")))?;
            let mut frame = vec![b'$', b'M', b'<', size, function];
            frame.extend_from_slice(payload);
            let checksum = frame[3..].iter().fold(0u8, |accumulator, byte| accumulator ^ byte);
            frame.push(checksum);
            frame
        }
        MspVersion::V2 => {
            let mut frame = vec![b'$', b'X', b'<'];
            let mut body = vec![0u8];
            body.extend_from_slice(&function.to_le_bytes());
            body.extend_from_slice(&(payload.len() as u16).to_le_bytes());
            body.extend_from_slice(payload);
            let checksum = body.iter().fold(0u8, |accumulator, byte| crc8_dvb_s2(accumulator, *byte));
            frame.extend_from_slice(&body);
            frame.push(checksum);
            frame
        }
    })
}

/// Incremental reader for a byte stream that arrives in arbitrary chunks.
///
/// A serial read returns whatever happened to be buffered, so frames arrive split and
/// interleaved with noise. The decoder holds partial input, resynchronises on the next
/// `$` after a bad checksum instead of discarding the whole buffer, and never blocks.
#[derive(Debug, Default)]
pub struct MspDecoder {
    buffer: Vec<u8>,
}

impl MspDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, bytes: &[u8]) {
        self.buffer.extend_from_slice(bytes);
    }

    pub fn buffered(&self) -> usize {
        self.buffer.len()
    }

    /// Returns the next complete frame, `Ok(None)` when more bytes are needed, or an error
    /// for a frame that arrived complete but corrupt. An error consumes the bad frame so a
    /// caller that logs and continues cannot spin on it forever.
    pub fn next_frame(&mut self) -> Result<Option<MspFrame>> {
        loop {
            let Some(start) = self.buffer.iter().position(|byte| *byte == b'$') else {
                self.buffer.clear();
                return Ok(None);
            };
            if start > 0 {
                self.buffer.drain(..start);
            }
            if self.buffer.len() < 3 {
                return Ok(None);
            }
            let outcome = match self.buffer[1] {
                b'M' => self.decode_v1(),
                b'X' => self.decode_v2(),
                _ => {
                    // Not an MSP header at all; step past this '$' and look for the next.
                    self.buffer.drain(..1);
                    continue;
                }
            };
            return outcome;
        }
    }

    fn direction(marker: u8) -> Result<bool> {
        match marker {
            b'>' => Ok(false),
            b'!' => Ok(true),
            // '<' is a request. Seeing one on the read path means the port echoed our own
            // bytes back, which is a wiring or mode fault rather than a controller reply.
            b'<' => Err(protocol("Received an MSP request on the response stream; the port may be echoing")),
            other => Err(protocol(format!("Unknown MSP direction byte 0x{other:02X}"))),
        }
    }

    fn decode_v1(&mut self) -> Result<Option<MspFrame>> {
        let rejected = match Self::direction(self.buffer[2]) {
            Ok(rejected) => rejected,
            Err(error) => {
                self.buffer.drain(..1);
                return Err(error);
            }
        };
        if self.buffer.len() < 5 {
            return Ok(None);
        }
        let size = self.buffer[3] as usize;
        let total = 6 + size;
        if self.buffer.len() < total {
            return Ok(None);
        }
        let frame: Vec<u8> = self.buffer.drain(..total).collect();
        let expected = frame[3..total - 1].iter().fold(0u8, |accumulator, byte| accumulator ^ byte);
        if expected != frame[total - 1] {
            return Err(protocol(format!(
                "MSP v1 checksum mismatch on function {}: expected 0x{expected:02X}, received 0x{:02X}",
                frame[4],
                frame[total - 1]
            )));
        }
        Ok(Some(MspFrame {
            version: MspVersion::V1,
            function: u16::from(frame[4]),
            payload: frame[5..total - 1].to_vec(),
            rejected,
        }))
    }

    fn decode_v2(&mut self) -> Result<Option<MspFrame>> {
        let rejected = match Self::direction(self.buffer[2]) {
            Ok(rejected) => rejected,
            Err(error) => {
                self.buffer.drain(..1);
                return Err(error);
            }
        };
        if self.buffer.len() < 8 {
            return Ok(None);
        }
        let function = u16::from_le_bytes([self.buffer[4], self.buffer[5]]);
        let size = usize::from(u16::from_le_bytes([self.buffer[6], self.buffer[7]]));
        if size > MAX_PAYLOAD {
            self.buffer.drain(..1);
            return Err(protocol(format!("MSP v2 frame declares {size} bytes, above the {MAX_PAYLOAD} limit")));
        }
        let total = 9 + size;
        if self.buffer.len() < total {
            return Ok(None);
        }
        let frame: Vec<u8> = self.buffer.drain(..total).collect();
        let expected = frame[3..total - 1].iter().fold(0u8, |accumulator, byte| crc8_dvb_s2(accumulator, *byte));
        if expected != frame[total - 1] {
            return Err(protocol(format!(
                "MSP v2 checksum mismatch on function {function}: expected 0x{expected:02X}, received 0x{:02X}",
                frame[total - 1]
            )));
        }
        Ok(Some(MspFrame { version: MspVersion::V2, function, payload: frame[8..total - 1].to_vec(), rejected }))
    }
}

/// Typed views of the read-only messages Phase 1 needs.
///
/// Each decoder states the exact width it expects. Betaflight has extended several of
/// these payloads over time, so trailing bytes are tolerated where the prefix layout is
/// stable, but a payload that is too short is always an error: a truncated reply must not
/// become a confident-looking half value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiVersion {
    pub protocol: u8,
    pub major: u8,
    pub minor: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FirmwareVersion {
    pub major: u8,
    pub minor: u8,
    pub patch: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardInfo {
    pub identifier: String,
    pub hardware_revision: u16,
}

/// Raw accelerometer, gyroscope and magnetometer counts, exactly as reported.
///
/// These are sensor counts, not physical units. Converting to deg/s needs the scale the
/// running firmware is configured with, which this phase has not read and must not guess.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawImu {
    pub accelerometer: [i16; 3],
    pub gyroscope: [i16; 3],
    pub magnetometer: [i16; 3],
}

fn expect_at_least(payload: &[u8], needed: usize, what: &str) -> Result<()> {
    if payload.len() < needed {
        return Err(protocol(format!("{what} needs at least {needed} bytes, received {}", payload.len())));
    }
    Ok(())
}

/// A four-character firmware or board tag. Betaflight pads with NULs; anything outside
/// printable ASCII means the stream is not what it claims to be.
fn decode_tag(bytes: &[u8], what: &str) -> Result<String> {
    let tag: String = bytes
        .iter()
        .take_while(|byte| **byte != 0)
        .map(|byte| char::from(*byte))
        .collect();
    if tag.is_empty() || !tag.chars().all(|character| character.is_ascii_graphic()) {
        return Err(protocol(format!("{what} is not printable ASCII: {bytes:?}")));
    }
    Ok(tag)
}

impl ApiVersion {
    pub fn decode(payload: &[u8]) -> Result<Self> {
        expect_at_least(payload, 3, "MSP_API_VERSION")?;
        Ok(Self { protocol: payload[0], major: payload[1], minor: payload[2] })
    }
}

impl FirmwareVersion {
    pub fn decode(payload: &[u8]) -> Result<Self> {
        expect_at_least(payload, 3, "MSP_FC_VERSION")?;
        Ok(Self { major: payload[0], minor: payload[1], patch: payload[2] })
    }
}

impl BoardInfo {
    pub fn decode(payload: &[u8]) -> Result<Self> {
        // Later firmware appends target capabilities and names after this prefix. The
        // first six bytes have been stable, so read those and ignore the remainder rather
        // than rejecting controllers newer than this build.
        expect_at_least(payload, 6, "MSP_BOARD_INFO")?;
        Ok(Self {
            identifier: decode_tag(&payload[..4], "Board identifier")?,
            hardware_revision: u16::from_le_bytes([payload[4], payload[5]]),
        })
    }
}

impl RawImu {
    pub fn decode(payload: &[u8]) -> Result<Self> {
        expect_at_least(payload, 18, "MSP_RAW_IMU")?;
        let word = |index: usize| i16::from_le_bytes([payload[index * 2], payload[index * 2 + 1]]);
        Ok(Self {
            accelerometer: [word(0), word(1), word(2)],
            gyroscope: [word(3), word(4), word(5)],
            magnetometer: [word(6), word(7), word(8)],
        })
    }
}

/// The firmware variant tag, checked against the one family this phase supports.
///
/// Phase 1 is a Betaflight slice. An INAV or Cleanflight board answers the same handshake
/// and would decode cleanly, so refusing anything but `BTFL` here is what keeps an
/// unsupported controller from being reported as a verified one.
pub const BETAFLIGHT_VARIANT: &str = "BTFL";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControllerIdentity {
    pub variant: String,
    pub api: ApiVersion,
    pub firmware: FirmwareVersion,
    pub board: BoardInfo,
}

impl ControllerIdentity {
    pub fn decode_variant(payload: &[u8]) -> Result<String> {
        expect_at_least(payload, 4, "MSP_FC_VARIANT")?;
        decode_tag(&payload[..4], "Firmware variant")
    }

    /// Assembles a verified identity, or refuses. There is no partial identity: the caller
    /// either knows which controller it is talking to or must treat it as unknown.
    pub fn assemble(variant: String, api: ApiVersion, firmware: FirmwareVersion, board: BoardInfo) -> Result<Self> {
        if variant != BETAFLIGHT_VARIANT {
            return Err(AppError::Unavailable(format!(
                "Connected controller reports firmware variant {variant}; this release supports {BETAFLIGHT_VARIANT} only"
            )));
        }
        Ok(Self { variant, api, firmware, board })
    }
}
