from dependency_injector import containers, providers

from src.core.config import get_config
from src.core.database import Database
from src.repository.user_repository import UserRepository
from src.services.user_service import UserService


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            "src.api.v1.endpoints.users",
            "src.api.v1.endpoints.auth",
        ]
    )

    config = providers.Singleton(get_config)

    database = providers.Singleton(Database, config=config)

    user_repository = providers.Factory(
        UserRepository,
        session_factory=database.provided.session,
    )

    user_service = providers.Factory(
        UserService,
        user_repository=user_repository,
    )
