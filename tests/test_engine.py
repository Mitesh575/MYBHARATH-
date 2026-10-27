import copy
import json
import pytest
from backend import engine as e

PREDICTION = "The measurement should respond after the chamber changes."
EXPLANATION = "The first responding stage and the next frozen stage locate the failure."


def investigate(fault, mode="practice", seed=11):
    s = e.new_state("case", mode, seed, fault=fault)
    e.set_stimulus(s, 45)
    for tool in ["raw_sensor", "controller", "network", "dashboard"]:
        e.probe(s, tool, PREDICTION)
    return s


@pytest.mark.parametrize("fault", e.FAULTS)
@pytest.mark.parametrize("mode", ["practice", "assessment"])
def test_correct_repair_restores_two_temperature_response(fault, mode):
    s = investigate(fault, mode)
    e.diagnose(s, fault, EXPLANATION, ["E01", "E02", "E03"])
    e.repair(s, e.MATCH[fault])
    assert e.public_state(s)["report"] is None
    e.verify(s)
    assert s["completed"]
    assert s["verification"]["passed"]
    assert s["verification"]["response_delta"] >= 8
    assert e.report(s)["score"] == 100


@pytest.mark.parametrize("fault", e.FAULTS)
def test_failures_have_distinguishable_observations(fault):
    s = investigate(fault)
    raw, ctrl, net, dash = [o["data"] for o in s["observations"]]
    assert dash["value"] == 28
    if fault == "sensor_stuck":
        assert raw["value"] == 28
        assert ctrl["source_sequence_used"] > 0
        assert net["packets_acknowledged"] == net["packets_sent"]
    elif fault == "firmware_stale":
        assert raw["value"] > 40
        assert ctrl["value"] == 28
        assert ctrl["source_sequence_used"] == 0
        assert net["packets_acknowledged"] > 0
    else:
        assert raw["value"] > 40 and ctrl["value"] > 40
        assert net["packets_acknowledged"] == 0
        assert dash["update_age"] > 0


@pytest.mark.parametrize("fault", e.FAULTS)
@pytest.mark.parametrize("mode", ["practice", "assessment"])
def test_wrong_repair_cannot_pass_verification(fault, mode):
    s = investigate(fault, mode)
    wrong = next(f for f in e.FAULTS if f != fault)
    e.diagnose(s, wrong, EXPLANATION, ["E01", "E02"])
    e.repair(s, e.MATCH[wrong])
    e.verify(s)
    assert not s["verification"]["passed"]
    assert s["completed"] == (mode == "assessment")
    if mode == "practice":
        e.diagnose(s, fault, EXPLANATION, ["E01", "E02", "E03"])
        e.repair(s, e.MATCH[fault])
        e.verify(s)
        assert s["completed"] and e.report(s)["score"] == 85


def test_equal_seed_and_actions_reproduce_readings():
    a = investigate("communication_drop", "assessment", 700)
    b = investigate("communication_drop", "assessment", 700)
    assert a["observations"] == b["observations"]
    assert a["tau"] == b["tau"]


def test_answer_is_hidden_until_case_ends():
    s = investigate("firmware_stale")
    public = e.public_state(s)
    assert public["report"] is None
    assert not {"seed", "original_fault", "active_fault", "actual", "tau"} & public.keys()
    assert "firmware_stale" not in json.dumps(public)
    e.finish(s)
    assert e.public_state(s)["report"]["answer"]["fault"] == "firmware_stale"
    with pytest.raises(e.LabError):
        e.set_stimulus(s, 40)


def test_guidance_does_not_depend_on_secret_fault():
    s = investigate("firmware_stale")
    other = copy.deepcopy(s)
    other["original_fault"] = "sensor_stuck"
    other["active_fault"] = "communication_drop"
    assert e.guided_hint(s) == e.guided_hint(other)


@pytest.mark.parametrize("ids", [["E01", "E01"], ["E01", "invented"]])
def test_diagnosis_rejects_fabricated_or_duplicate_evidence(ids):
    s = investigate("sensor_stuck")
    with pytest.raises(e.LabError):
        e.diagnose(s, "sensor_stuck", EXPLANATION, ids)


def test_assessment_locks_second_diagnosis_and_repair():
    s = investigate("sensor_stuck", "assessment")
    e.diagnose(s, "sensor_stuck", EXPLANATION, ["E01", "E02"])
    with pytest.raises(e.LabError):
        e.diagnose(s, "firmware_stale", EXPLANATION, ["E01", "E02"])
    e.repair(s, "replace_sensor")
    with pytest.raises(e.LabError):
        e.repair(s, "replace_sensor")


def test_workflow_requires_prediction_diagnosis_and_repair():
    s = e.new_state("case", "practice", 5)
    for operation in [lambda: e.probe(s, "raw_sensor", "short"),
                      lambda: e.repair(s, "replace_sensor"), lambda: e.verify(s)]:
        with pytest.raises(e.LabError):
            operation()
