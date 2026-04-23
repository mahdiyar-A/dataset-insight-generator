# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore (separate layer for caching)
COPY backend.csproj ./
RUN dotnet restore

# Copy everything else and publish
COPY . ./
RUN dotnet publish -c Release -o /app/publish --no-restore

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Create storage directory (used for temp file uploads)
RUN mkdir -p /app/storage

COPY --from=build /app/publish ./

EXPOSE 8080

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://0.0.0.0:8080

ENTRYPOINT ["dotnet", "backend.dll"]
