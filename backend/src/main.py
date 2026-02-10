import logging
import os

from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.cors import CORSMiddleware

from src.api.routes import routers
from src.core.config import config
from src.core.container import Container
from src.core.events import lifespan
from src.core.exception_handlers import (
    auth_error_handler,
    duplicated_error_handler,
    global_exception_handler,
    not_found_error_handler,
    not_satisfiable_error_handler,
    permission_denied_error_handler,
    request_validation_exception_handler,
    sqlalchemy_exception_handler,
    unauthorized_error_handler,
    validation_error_handler,
)
from src.core.exceptions import (
    AuthError,
    DuplicatedError,
    NotFoundError,
    NotSatisfiableError,
    PermissionDeniedError,
    UnauthorizedError,
    ValidationError,
)
from src.util.class_object import singleton

logger = logging.getLogger(__name__)


@singleton
class AppCreator:
    def __init__(self):
        self.app = FastAPI(
            title=config.PROJECT_NAME,
            openapi_url="/openapi.json",
            version="0.0.1",
            root_path=os.getenv("API_ROOT_PATH", "/"),
            lifespan=lifespan,
        )

        self._configure_monitoring()

        self.container = Container()
        self.container.wire(modules=self.container.wiring_config.modules)
        self.app.state.container = self.container
        self.db = self.container.database()

        if config.BACKEND_CORS_ORIGINS:
            self.app.add_middleware(
                CORSMiddleware,
                allow_origins=[str(origin) for origin in config.BACKEND_CORS_ORIGINS],
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["*"],
            )
        self.app.add_middleware(CorrelationIdMiddleware)

        self.app.include_router(routers, prefix=config.API_STR)
        self._register_exception_handlers()

    def _configure_monitoring(self):
        try:
            FastAPIInstrumentor().instrument_app(self.app)

            logger.info("Instrumentation configured successfully")
        except Exception as e:
            logger.error(f"Failed to configure instrumentation: {str(e)}")

    def _register_exception_handlers(self):
        self.app.add_exception_handler(
            RequestValidationError, request_validation_exception_handler
        )
        self.app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)

        custom_exceptions = [
            (DuplicatedError, duplicated_error_handler),
            (AuthError, auth_error_handler),
            (NotFoundError, not_found_error_handler),
            (ValidationError, validation_error_handler),
            (PermissionDeniedError, permission_denied_error_handler),
            (UnauthorizedError, unauthorized_error_handler),
            (NotSatisfiableError, not_satisfiable_error_handler),
        ]
        for exception_class, handler in custom_exceptions:
            self.app.add_exception_handler(exception_class, handler)

        self.app.add_exception_handler(Exception, global_exception_handler)


app_creator = AppCreator()
app = app_creator.app
db = app_creator.db
container = app_creator.container
