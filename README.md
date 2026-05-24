# Tirititito 3D ⚽💨
### Simulador Físico 3D del Efecto Magnus en el Fútbol

**Tirititito 3D** es una aplicación interactiva de simulación física en tiempo real diseñada para modelar de forma precisa la trayectoria de un balón de fútbol, considerando la gravedad, la resistencia del aire (fuerza de arrastre) y el **Efecto Magnus** (sustentación generada por la rotación del balón).

El simulador permite experimentar de forma visual cómo influyen parámetros como la velocidad inicial, la rotación (spin), el ángulo del eje de giro, el viento o la altitud del estadio en el desvío lateral y caída de la pelota.

---

## 🚀 Características Principales

*   **Renderizado 3D Interactivo**: Visualización construida sobre **Three.js** con simulación de césped, portería reglamentaria y barrera defensiva interactiva.
*   **Múltiples Cámaras Adaptativas**:
    *   🎥 **Jugador**: Vista en primera persona desde el punto de disparo.
    *   🛡️ **Portería**: La perspectiva del arquero ante el tiro.
    *   📐 **Cenital**: Vista aérea en planta para apreciar la curvatura lateral pura.
    *   📹 **Seguimiento**: Cámara móvil que persigue al balón de cerca.
    *   📺 **Transmisión TV**: Vista de transmisión televisiva profesional (zoom óptico y paneo).
    *   🌐 **Libre**: Control orbital completo con el ratón.
*   **Recreación de Tiros Libres Legendarios**: Carga de forma inmediata los parámetros físicos reales de cuatro goles icónicos de la historia del fútbol:
    *   🇧🇷 **Roberto Carlos (1997)** vs Francia (*El tiro libre que desafió a la física*).
    *   🇵🇹 **Cristiano Ronaldo (2008)** vs Portsmouth (*Knuckleball clásica sin rotación*).
    *   🇦🇷 **Lionel Messi (2019)** vs Liverpool (*Parábola perfecta por encima de la barrera*).
    *   🇧🇷 **Ronaldinho (2002)** vs Inglaterra (*Efecto "hoja seca" de vaselina*).
*   **Instrumentación y Telemetría en Tiempo Real**:
    *   Gráficas dinámicas de trayectoria (**Chart.js**) en vista lateral y cenital.
    *   Gráfica de descomposición de fuerzas físicas en tiempo real durante el vuelo.
    *   Visualizador 2D del eje de rotación y sentido de giro inicial.
*   **Factores Ambientales**: Simulación de viento (velocidad y dirección) y altitud de juego (con variación de densidad de aire según modelo barométrico estándar, ej. CDMX o La Paz).

---

## 📐 Fundamento Físico

El movimiento del balón se calcula resolviendo paso a paso las ecuaciones diferenciales del movimiento en tres dimensiones mediante el método de integración de Euler:

$$\vec{F}_{total} = \vec{F}_G + \vec{F}_D + \vec{F}_M$$

*   **Gravedad ($\vec{F}_G$):** $\vec{F}_G = m \cdot \vec{g}$ (dirigida hacia abajo).
*   **Arrastre / Resistencia del aire ($\vec{F}_D$):** $\vec{F}_D = -\frac{1}{2} C_D \cdot \rho \cdot A \cdot v \cdot \vec{v}$ (opuesta al movimiento).
*   **Fuerza de Magnus ($\vec{F}_M$):** $\vec{F}_M = C_L \cdot \frac{1}{2}\rho \cdot A \cdot v^2 \cdot (\hat{\omega} \times \hat{v})$ (perpendicular a la velocidad y al eje de rotación).

---

## 🛠️ Tecnologías Utilizadas

*   **HTML5** y **Vanilla CSS3** (Diseño premium responsivo con soporte para Pantalla Completa y HUD ocultable mediante la tecla `H`).
*   **Three.js** (Motor de gráficos 3D y renderizado WebGL).
*   **Chart.js** (Renderizado dinámico de gráficas 2D).
*   **Lucide Icons** (Iconografía limpia y moderna).

---

## 📦 Ejecución Local

Dado que es una aplicación basada íntegramente en el cliente, no necesita ningún servidor de backend o instalación de dependencias pesadas.

1.  Clona el repositorio:
    ```bash
    git clone https://github.com/Silver19368/Magnus.git
    ```
2.  Abre el archivo `index.html` en cualquier navegador web moderno.
