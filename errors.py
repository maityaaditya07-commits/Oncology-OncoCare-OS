class DomainError(Exception):
    status = 400

    def __init__(self, detail):
        super().__init__(str(detail))
        self.detail = detail


class BadRequest(DomainError):
    status = 400


class Forbidden(DomainError):
    status = 403


class NotFound(DomainError):
    status = 404


class Conflict(DomainError):
    status = 409
