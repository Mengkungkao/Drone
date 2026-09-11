//! Protocol tests for the Phase 1 Betaflight slice.
//!
//! No hardware is involved. These check the codec against the framing rules and against
//! byte sequences built to the published layouts, which is exactly as far as they can
//! honestly go: they prove the decoder handles well-formed and malformed input as
//! specified. They do not prove any real controller was contacted, identified or read.
use dronelab::error::AppError;
use dronelab::msp::{
    encode_request, ApiVersion, BoardInfo, ControllerIdentity, FirmwareVersion, MspDecoder,
    MspRequest, MspVersion, RawImu, BETAFLIGHT_VARIANT,
};

/// Builds a v1 response the way firmware does, so tests exercise the real checksum rule
/// rather than a checksum this test file invented.
fn v1_response(function: u8, payload: &[u8]) -> Vec<u8> {
    let mut frame = vec![b'$', b'M', b'>', payload.len() as u8, function];
    frame.extend_from_slice(payload);
    let checksum = frame[3..].iter().fold(0u8, |accumulator, byte| accumulator ^ byte);
    frame.push(checksum);
    frame
}

fn crc8_dvb_s2(seed: u8, byte: u8) -> u8 {
    let mut crc = seed ^ byte;
    for _ in 0..8 {
        crc = if crc & 0x80 != 0 { (crc << 1) ^ 0xD5 } else { crc << 1 };
    }
    crc
}

fn v2_response(function: u16, payload: &[u8]) -> Vec<u8> {
    let mut body = vec![0u8];
    body.extend_from_slice(&function.to_le_bytes());
    body.extend_from_slice(&(payload.len() as u16).to_le_bytes());
    body.extend_from_slice(payload);
    let checksum = body.iter().fold(0u8, |accumulator, byte| crc8_dvb_s2(accumulator, *byte));
    let mut frame = vec![b'$', b'X', b'>'];
    frame.extend_from_slice(&body);
    frame.push(checksum);
    frame
}

#[test]
fn v1_request_matches_the_documented_framing_and_checksum() {
    let frame = encode_request(MspVersion::V1, MspRequest::ApiVersion, &[]).expect("encode");
    // '$M<', zero-length payload, function 1, checksum = 0 XOR 1.
    assert_eq!(frame, vec![b'$', b'M', b'<', 0x00, 0x01, 0x01]);
}

#[test]
fn v2_request_carries_the_wide_function_and_dvb_s2_checksum() {
    let frame = encode_request(MspVersion::V2, MspRequest::RawImu, &[]).expect("encode");
    assert_eq!(&frame[..3], b"$X<");
    assert_eq!(frame[3], 0, "flag byte is reserved and sent as zero");
    assert_eq!(u16::from_le_bytes([frame[4], frame[5]]), 102);
    assert_eq!(u16::from_le_bytes([frame[6], frame[7]]), 0);
    let expected = frame[3..frame.len() - 1].iter().fold(0u8, |accumulator, byte| crc8_dvb_s2(accumulator, *byte));
    assert_eq!(*frame.last().unwrap(), expected);
}

#[test]
fn a_frame_split_across_reads_is_reassembled() {
    // A serial read returns whatever is buffered, so every boundary must be survivable.
    let frame = v1_response(3, &[4, 5, 0]);
    for split in 1..frame.len() {
        let mut decoder = MspDecoder::new();
        decoder.push(&frame[..split]);
        assert!(matches!(decoder.next_frame(), Ok(None)), "split at {split} yielded a frame too early");
        decoder.push(&frame[split..]);
        let decoded = decoder.next_frame().expect("decode").expect("frame");
        assert_eq!(decoded.function, 3);
        assert_eq!(decoded.payload, vec![4, 5, 0]);
    }
}

#[test]
fn several_frames_in_one_read_are_all_returned() {
    let mut decoder = MspDecoder::new();
    decoder.push(&v1_response(1, &[0, 1, 46]));
    decoder.push(&v2_response(102, &[0; 18]));
    assert_eq!(decoder.next_frame().unwrap().unwrap().function, 1);
    assert_eq!(decoder.next_frame().unwrap().unwrap().function, 102);
    assert!(decoder.next_frame().unwrap().is_none());
}

#[test]
fn leading_noise_is_skipped_without_losing_the_frame_behind_it() {
    let mut decoder = MspDecoder::new();
    decoder.push(b"\x00garbage\xff");
    decoder.push(&v1_response(2, b"BTFL"));
    let decoded = decoder.next_frame().expect("decode").expect("frame");
    assert_eq!(decoded.payload, b"BTFL".to_vec());
}

#[test]
fn a_corrupt_checksum_is_an_error_and_the_stream_recovers() {
    let mut frame = v1_response(1, &[0, 1, 46]);
    let last = frame.len() - 1;
    frame[last] ^= 0xFF;
    let mut decoder = MspDecoder::new();
    decoder.push(&frame);
    decoder.push(&v1_response(3, &[4, 5, 0]));

    let error = decoder.next_frame().expect_err("corrupt frame must not decode");
    assert!(matches!(error, AppError::Protocol(_)), "got {error:?}");
    // The bad frame is consumed, so a caller that logs and continues makes progress
    // rather than re-reading the same corruption forever.
    let recovered = decoder.next_frame().expect("decode").expect("frame");
    assert_eq!(recovered.function, 3);
}

#[test]
fn a_v2_frame_declaring_an_absurd_length_is_refused_without_waiting_for_it() {
    let mut decoder = MspDecoder::new();
    decoder.push(&[b'$', b'X', b'>', 0, 102, 0, 0xFF, 0xFF]);
    let error = decoder.next_frame().expect_err("oversized frame must be refused");
    assert!(matches!(error, AppError::Protocol(_)), "got {error:?}");
}

#[test]
fn an_echoed_request_is_reported_rather_than_parsed_as_a_reply() {
    let mut decoder = MspDecoder::new();
    decoder.push(&encode_request(MspVersion::V1, MspRequest::ApiVersion, &[]).unwrap());
    let error = decoder.next_frame().expect_err("a request on the read path is a fault");
    assert!(matches!(error, AppError::Protocol(_)), "got {error:?}");
}

#[test]
fn a_refusal_is_delivered_as_an_answer_not_a_decoding_failure() {
    // '$M!' means the controller understood the framing and declined the function.
    let mut frame = vec![b'$', b'M', b'!', 0x00, 0x63];
    frame.push(frame[3..].iter().fold(0u8, |accumulator, byte| accumulator ^ byte));
    let mut decoder = MspDecoder::new();
    decoder.push(&frame);
    let decoded = decoder.next_frame().expect("decode").expect("frame");
    assert!(decoded.rejected, "a rejection must be visible to the caller");
    assert_eq!(decoded.function, 99);
}

#[test]
fn truncated_payloads_are_errors_rather_than_partial_values() {
    assert!(ApiVersion::decode(&[0, 1]).is_err());
    assert!(FirmwareVersion::decode(&[4, 5]).is_err());
    assert!(BoardInfo::decode(b"AIRB\x01").is_err());
    // Seventeen bytes is one short of the nine words MSP_RAW_IMU carries. Accepting it
    // would mean publishing a gyro axis assembled from a missing byte.
    assert!(RawImu::decode(&[0; 17]).is_err());
}

#[test]
fn identity_payloads_decode_to_their_documented_fields() {
    assert_eq!(ApiVersion::decode(&[0, 1, 46]).unwrap(), ApiVersion { protocol: 0, major: 1, minor: 46 });
    assert_eq!(FirmwareVersion::decode(&[4, 5, 1]).unwrap(), FirmwareVersion { major: 4, minor: 5, patch: 1 });
    let board = BoardInfo::decode(b"AIRB\x02\x00extra-target-bytes").expect("trailing bytes are tolerated");
    assert_eq!(board.identifier, "AIRB");
    assert_eq!(board.hardware_revision, 2);
}

#[test]
fn raw_imu_preserves_sign_and_axis_order() {
    let mut payload = Vec::new();
    for value in [10i16, -20, 30, -1, 2, -3, 400, -500, 600] {
        payload.extend_from_slice(&value.to_le_bytes());
    }
    let imu = RawImu::decode(&payload).expect("decode");
    assert_eq!(imu.accelerometer, [10, -20, 30]);
    assert_eq!(imu.gyroscope, [-1, 2, -3]);
    assert_eq!(imu.magnetometer, [400, -500, 600]);
}

#[test]
fn a_non_betaflight_controller_is_refused_rather_than_reported_as_verified() {
    // INAV answers the same handshake and decodes cleanly. Phase 1 supports Betaflight,
    // so anything else must fail closed instead of being presented as an identified board.
    let variant = ControllerIdentity::decode_variant(b"INAV").expect("a valid tag");
    let error = ControllerIdentity::assemble(
        variant,
        ApiVersion { protocol: 0, major: 2, minor: 4 },
        FirmwareVersion { major: 7, minor: 1, patch: 0 },
        BoardInfo { identifier: "MATEKF405".into(), hardware_revision: 0 },
    )
    .expect_err("an unsupported variant must not assemble an identity");
    assert!(matches!(error, AppError::Unavailable(_)), "got {error:?}");
}

#[test]
fn a_betaflight_controller_assembles_a_complete_identity() {
    let variant = ControllerIdentity::decode_variant(b"BTFL\x00\x00").expect("NUL padding is tolerated");
    assert_eq!(variant, BETAFLIGHT_VARIANT);
    let identity = ControllerIdentity::assemble(
        variant,
        ApiVersion::decode(&[0, 1, 46]).unwrap(),
        FirmwareVersion::decode(&[4, 5, 1]).unwrap(),
        BoardInfo::decode(b"AIRB\x02\x00").unwrap(),
    )
    .expect("a supported controller");
    assert_eq!(identity.board.identifier, "AIRB");
    assert_eq!(identity.firmware.major, 4);
}

#[test]
fn a_garbled_variant_tag_is_refused() {
    assert!(ControllerIdentity::decode_variant(&[0xFF, 0xFE, 0x01, 0x02]).is_err());
    assert!(ControllerIdentity::decode_variant(b"BT").is_err());
}
