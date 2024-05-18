from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

# Docs Authentication Imports
from fastapi import Depends, HTTPException, status
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets

import os
from dotenv import load_dotenv

load_dotenv()

DEPLOY_ENV = os.getenv("DEPLOY_ENV")
API_USERNAME = os.getenv("API_USERNAME")
API_PASSWORD = os.getenv("API_PASSWORD")

# TODO: Update the Contants
API_TITLE = "Your API Title"
API_DESCRIPTION = "Your API Description"
API_VERSION = '0.0.1'


openapi_prefix = f"/{DEPLOY_ENV}"

app = FastAPI(
    title=API_TITLE,
    version=API_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url = None,
    root_path = openapi_prefix
)

async def startup_event():
    print("Demo startup event complete.")

app.add_event_handler("startup", startup_event)

# importing routers
import endpoint.urls

app.include_router(endpoint.urls.router, prefix="/action", tags=['Endpoint'])

# CORS urls
origins = [
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DOCS CUSTOMISATION
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=API_TITLE,
        version=API_VERSION,
        description=API_DESCRIPTION,
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, API_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, API_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/docs", include_in_schema=False)
async def get_swagger_documentation(username: str = Depends(get_current_username)):
    return get_swagger_ui_html(openapi_url=f"{openapi_prefix}/openapi.json", title="docs")

@app.get("/redoc", include_in_schema=False)
async def get_redoc_documentation(username: str = Depends(get_current_username)):
    return get_redoc_html(openapi_url=f"{openapi_prefix}/openapi.json", title="docs")

@app.get("/openapi.json", include_in_schema=False)
async def openapi(username: str = Depends(get_current_username)):
    openapi_dict = get_openapi(title=app.title, version=app.version, routes=app.routes)
    openapi_dict["servers"] = [
        {
            "url": openapi_prefix
        }
    ]
    return openapi_dict

# base path endpoint
@app.get("/", tags=["Testing"])
async def read_root():
    return {
        "message": f"Welcome to the Kuriux FastAPI - {DEPLOY_ENV.capitalize()} deployment. Unauthorized usage of the API is forbidden.",
        "copyright" : "Kurix - Open Source",
    }
