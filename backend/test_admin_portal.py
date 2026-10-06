import unittest
from http.cookies import SimpleCookie
from unittest.mock import patch

from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import main
from database import Base, CampusHazardLog


def make_request(cookie: str | None = None, origin: str | None = None) -> Request:
    headers = []
    if cookie:
        headers.append((b"cookie", f"{main.ADMIN_SESSION_COOKIE}={cookie}".encode()))
    if origin:
        headers.append((b"origin", origin.encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/admin",
        "raw_path": b"/api/admin",
        "query_string": b"",
        "headers": headers,
        "client": ("admin-test-client", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


class AdminPortalTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        main.ADMIN_LOGIN_ATTEMPTS.clear()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        main.ADMIN_LOGIN_ATTEMPTS.clear()

    def test_admin_login_issues_http_only_session_cookie(self):
        response = Response()
        with patch.dict(
            "os.environ",
            {"ADMIN_PASSWORD": "demo-password", "ADMIN_SESSION_SECRET": "test-session-secret"},
            clear=False,
        ):
            result = main.admin_login(
                main.AdminLoginRequest(password="demo-password"),
                make_request(),
                response,
            )

        cookie = SimpleCookie()
        cookie.load(response.headers["set-cookie"])
        morsel = cookie[main.ADMIN_SESSION_COOKIE]
        self.assertTrue(result["success"])
        self.assertTrue(morsel["httponly"])
        self.assertEqual(morsel["samesite"], "strict")
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            self.assertIsNone(main.require_admin(make_request(morsel.value)))

    def test_secure_admin_cookie_supports_cross_origin_deployment(self):
        response = Response()
        with patch.dict(
            "os.environ",
            {
                "ADMIN_PASSWORD": "demo-password",
                "ADMIN_SESSION_SECRET": "test-session-secret",
                "ADMIN_COOKIE_SECURE": "true",
            },
            clear=False,
        ):
            main.admin_login(
                main.AdminLoginRequest(password="demo-password"),
                make_request(),
                response,
            )

        cookie = SimpleCookie()
        cookie.load(response.headers["set-cookie"])
        morsel = cookie[main.ADMIN_SESSION_COOKIE]
        self.assertTrue(morsel["secure"])
        self.assertEqual(morsel["samesite"].lower(), "none")

    def test_invalid_password_is_rejected(self):
        with patch.dict(
            "os.environ",
            {"ADMIN_PASSWORD": "demo-password", "ADMIN_SESSION_SECRET": "test-session-secret"},
            clear=False,
        ):
            with self.assertRaises(HTTPException) as raised:
                main.admin_login(
                    main.AdminLoginRequest(password="wrong-password"),
                    make_request(),
                    Response(),
                )

        self.assertEqual(raised.exception.status_code, 401)

    def test_missing_admin_configuration_disables_login(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(HTTPException) as raised:
                main.admin_login(
                    main.AdminLoginRequest(password="anything"),
                    make_request(),
                    Response(),
                )

        self.assertEqual(raised.exception.status_code, 503)

    def test_report_updates_require_a_valid_session(self):
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            with self.assertRaises(HTTPException) as raised:
                main.require_admin(make_request())
        self.assertEqual(raised.exception.status_code, 401)

    def test_expired_or_tampered_session_is_rejected(self):
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            expired_token = main._admin_session_token("test-session-secret", 1)
            with self.assertRaises(HTTPException) as expired:
                main.require_admin(make_request(expired_token))
            with self.assertRaises(HTTPException) as tampered:
                main.require_admin(make_request(expired_token + "tampered"))

        self.assertEqual(expired.exception.status_code, 401)
        self.assertEqual(tampered.exception.status_code, 401)

    def test_admin_session_rejects_unconfigured_origin(self):
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            with self.assertRaises(HTTPException) as raised:
                main.require_admin(make_request(token, origin="https://untrusted.example"))
        self.assertEqual(raised.exception.status_code, 403)

    def test_admin_report_list_is_protected(self):
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            with self.assertRaises(HTTPException) as raised:
                main.require_admin(make_request())
        self.assertEqual(raised.exception.status_code, 401)

    def test_admin_review_queue_contains_only_pending_reports(self):
        pending_report = CampusHazardLog(
            location_name="Rajgad",
            hazard_type="Broken light",
            severity="LOW",
            assigned_dept="Unassigned",
            status="Pending",
        )
        approved_report = CampusHazardLog(
            location_name="Rajgad",
            hazard_type="AC repair",
            severity="MEDIUM",
            assigned_dept="Facilities",
            status="Approved",
        )
        rejected_report = CampusHazardLog(
            location_name="Architecture",
            hazard_type="Duplicate report",
            severity="LOW",
            assigned_dept="Facilities",
            status="Rejected",
        )
        self.db.add_all([pending_report, approved_report, rejected_report])
        self.db.commit()

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            reports = main.get_admin_campus_hazards(None, self.db)

        self.assertEqual([report.id for report in reports], [pending_report.id])

    def test_admin_can_approve_report_and_assign_responsible_team(self):
        report = CampusHazardLog(
            location_name="Rajgad",
            department_name="Electrical",
            room_name="Lab 3",
            hazard_type="AC not cooling",
            severity="HIGH",
            assigned_dept="Unassigned",
            status="Pending",
        )
        self.db.add(report)
        self.db.commit()

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            result = main.update_campus_hazard_report(
                report.id,
                main.AdminReportUpdate(status="Approved", assigned_dept="Electrical Maintenance"),
                None,
                self.db,
            )

        self.assertEqual(result["data"].status, "Approved")
        self.assertEqual(result["data"].assigned_dept, "Electrical Maintenance")
        self.assertIsNone(result["data"].rejection_reason)
        self.assertEqual(self.db.query(CampusHazardLog).count(), 1)
        self.assertEqual(self.db.get(CampusHazardLog, report.id).status, "Approved")

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            main.require_admin(make_request(token))
            self.assertEqual(main.get_admin_campus_hazards(None, self.db), [])

        public_reports = main.get_campus_hazards(self.db)
        self.assertEqual([saved.id for saved in public_reports], [report.id])
        self.assertEqual(public_reports[0].status, "Approved")

    def test_admin_rejection_requires_reason_and_responsible_team(self):
        report = CampusHazardLog(
            location_name="Rajgad",
            hazard_type="Broken chair",
            severity="MEDIUM",
            assigned_dept="Unassigned",
            status="Pending",
        )
        self.db.add(report)
        self.db.commit()

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            with self.assertRaises(HTTPException) as missing_team:
                main.update_campus_hazard_report(
                    report.id,
                    main.AdminReportUpdate(status="Approved", assigned_dept="  "),
                    None,
                    self.db,
                )
            with self.assertRaises(HTTPException) as missing_reason:
                main.update_campus_hazard_report(
                    report.id,
                    main.AdminReportUpdate(status="Rejected", assigned_dept="Facilities"),
                    None,
                    self.db,
                )

        self.assertEqual(missing_team.exception.status_code, 422)
        self.assertIn("Responsible team", missing_team.exception.detail)
        self.assertEqual(missing_reason.exception.status_code, 422)
        self.assertIn("reason", missing_reason.exception.detail)

    def test_admin_can_reject_report_with_reason_and_responsible_team(self):
        report = CampusHazardLog(
            location_name="Rajgad",
            hazard_type="Broken chair",
            severity="MEDIUM",
            assigned_dept="Unassigned",
            status="Pending",
        )
        self.db.add(report)
        self.db.commit()

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            result = main.update_campus_hazard_report(
                report.id,
                main.AdminReportUpdate(
                    status="Rejected",
                    assigned_dept="Facilities",
                    rejection_reason="Duplicate report",
                ),
                None,
                self.db,
            )

        self.assertEqual(result["data"].status, "Rejected")
        self.assertEqual(result["data"].assigned_dept, "Facilities")
        self.assertEqual(result["data"].rejection_reason, "Duplicate report")

    def test_admin_cannot_review_a_report_twice(self):
        report = CampusHazardLog(
            location_name="Rajgad",
            hazard_type="AC not cooling",
            severity="HIGH",
            assigned_dept="Electrical Maintenance",
            status="Approved",
        )
        self.db.add(report)
        self.db.commit()

        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            with self.assertRaises(HTTPException) as raised:
                main.update_campus_hazard_report(
                    report.id,
                    main.AdminReportUpdate(status="Rejected", assigned_dept="Electrical Maintenance", rejection_reason="Duplicate"),
                    None,
                    self.db,
                )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(report.status, "Approved")

    def test_admin_cannot_set_unsupported_report_status(self):
        with patch.dict("os.environ", {"ADMIN_SESSION_SECRET": "test-session-secret"}, clear=False):
            token = main._admin_session_token("test-session-secret", 4_102_444_800)
            main.require_admin(make_request(token))
            with self.assertRaises(HTTPException) as raised:
                main.update_campus_hazard_report(
                    1,
                    main.AdminReportUpdate(status="Pretend Approved"),
                    None,
                    self.db,
                )

        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
