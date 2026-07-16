import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status
from app.config import settings

# Initialize JWKS client pointing to Supabase auth keys
# Supabase exposes their public keys at /auth/v1/jwks
jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
print(f"Auth: Initializing JWK client pointing to {jwks_url}")
jwks_client = PyJWKClient(jwks_url)

def get_current_user(authorization: str = Header(None)) -> str:
    # If keys are missing in env, allow mock auth for development testing
    if not settings.supabase_url:
        print("Warning: Missing SUPABASE_URL. Returning mock user_id.")
        return "mock-user-12345"

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
        
    # Expect "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected Bearer <JWT>"
        )
        
    token = parts[1]
    
    try:
        # 1. Fetch public signing key matching the kid in token header
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # 2. Decode and verify signature, claims, and audience
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated"
        )
        
        # 3. Extract user_id (subject claim)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User identity (sub claim) missing from token"
            )
            
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {e}"
        )
    except Exception as e:
        # Fallback for JWKS network issues or key matching failures
        print(f"Auth verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )
