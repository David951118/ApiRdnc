const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const xml2js = require("xml2js");
const logger = require("../config/logger");
const config = require("../config/env");
const RNDCLog = require("../models/RNDCLog");

class RNDCClient {
  constructor(username, password, endpoint = process.env.RNDC_ENDPOINT) {
    this.username = username;
    this.password = password;
    this.endpoint =
      endpoint || "http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices";
    this.headers = {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC",
    };

    // Initialize Axios with retry strategy and mandatory timeout
    // Enforcing a minimum of 120s due to RNDC API latency.
    const timeout = Math.max(config.rndc.requestTimeout || 60000, 120000);
    this.axiosInstance = axios.create({
      timeout: timeout,
      headers: this.headers,
    });

    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.code === "ECONNABORTED" ||
          (error.response && error.response.status >= 500)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn(
          `Retrying RNDC request (${retryCount}/3): ${error.message} - ${error.code}`,
        );
      },
    });
  }

  /**
   * Private helper for interaction logging
   */
  async _logInteraction(tipo, soapXML, start, result, error, metadata = {}) {
    try {
      const duration = Date.now() - start;
      const status = error
        ? error.code === "ECONNABORTED" || error.message.includes("timeout")
          ? "timeout"
          : "error"
        : "success";

      await RNDCLog.create({
        tipo,
        endpoint: this.endpoint,
        status,
        duration,
        requestPayload: soapXML,
        responsePayload: error
          ? error.message || JSON.stringify(error)
          : JSON.stringify(result),
        metadata,
      });
    } catch (logError) {
      logger.error(`Error saving RNDC log: ${logError.message}`);
    }
  }

  /**
   * Builds the SOAP Envelope
   */
  _buildSOAPEnvelope(innerXML) {
    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:BPMServicesIntf-IBPMServices">
    <soapenv:Body>
        <urn:AtenderMensajeRNDC>
            <urn:Request>${this._escapeXML(innerXML)}</urn:Request>
        </urn:AtenderMensajeRNDC>
    </soapenv:Body>
</soapenv:Envelope>`;
  }

  _escapeXML(xml) {
    return xml;
  }

  /**
   * Builds the internal RNDC XML structure
   */
  _buildRNDCXML(tipo, procesoid, variables = "", documento = "") {
    let xml = `<root>
<acceso>
<username>${this.username}</username>
<password>${this.password}</password>
</acceso>
<solicitud>
<tipo>${tipo}</tipo>
<procesoid>${procesoid}</procesoid>
</solicitud>`;

    if (variables) {
      xml += `<variables>${variables}</variables>`;
    }

    if (documento) {
      xml += `<documento>${documento}</documento>`;
    }

    xml += "</root>";
    return xml;
  }

  /**
   * Consult Authorized Manifests
   * @param {string} nitGPS - GPS Company NIT
   * @param {string} tipo - 'nuevos' | 'todos'
   */
  async consultarManifiestosAutorizados(nitGPS, tipo = "nuevos") {
    const documento = `<numidgps>${nitGPS}</numidgps>
<manifiestos>${tipo.toUpperCase()}</manifiestos>`;

    const innerXML = this._buildRNDCXML(9, 4, "", documento);
    const soapXML = this._buildSOAPEnvelope(innerXML);
    const start = Date.now();

    try {
      logger.debug(`Querying Manifests: ${tipo}`);

      const response = await this.axiosInstance.post(this.endpoint, soapXML, {
        timeout: this.axiosInstance.defaults.timeout,
      });

      const parsed = await this._parseResponse(response.data);
      this._logInteraction(
        "consulta_manifiestos",
        soapXML,
        start,
        parsed,
        null,
        { nitGPS, tipo },
      );
      return parsed;
    } catch (error) {
      logger.error(`Error querying manifests: ${error.message}`);
      this._logInteraction(
        "consulta_manifiestos",
        soapXML,
        start,
        null,
        error,
        { nitGPS, tipo },
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Consult Manifest by ID
   * @param {string} nitGPS - GPS Company NIT
   * @param {string} ingresoidManifiesto - Manifest ID
   */
  async consultarManifiestoPorId(nitGPS, ingresoidManifiesto) {
    const documento = `<numidgps>${nitGPS}</numidgps>
<ingresoidmanifiesto>${ingresoidManifiesto}</ingresoidmanifiesto>`;

    const innerXML = this._buildRNDCXML(9, 4, "", documento);
    const soapXML = this._buildSOAPEnvelope(innerXML);
    const start = Date.now();

    try {
      logger.debug(`Querying Manifest ID: ${ingresoidManifiesto}`);

      const response = await this.axiosInstance.post(this.endpoint, soapXML, {
        timeout: this.axiosInstance.defaults.timeout,
      });

      const parsed = await this._parseResponse(response.data);
      this._logInteraction(
        "consulta_manifiesto",
        soapXML,
        start,
        parsed,
        null,
        { nitGPS, ingresoidManifiesto },
      );
      return parsed;
    } catch (error) {
      logger.error(`Error querying manifest by ID: ${error.message}`);
      await this._logInteraction(
        "consulta_manifiesto",
        soapXML,
        start,
        null,
        error,
        {
          nitGPS,
          ingresoidManifiesto,
        },
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Register RMM (Manifest Monitoring Record)
   * @param {Object} datos - RMM Data
   */
  async registrarRMM(datos) {
    const {
      numidgps,
      ingresoidmanifiesto,
      numplaca,
      codpuntocontrol,
      latitud,
      longitud,
      fechallegada,
      horallegada,
      fechasalida,
      horasalida,
      sinsalida,
    } = datos;

    let variables = `<numidgps>${numidgps}</numidgps>
<ingresoidmanifiesto>${ingresoidmanifiesto}</ingresoidmanifiesto>
<numplaca>${numplaca}</numplaca>
<codpuntocontrol>${codpuntocontrol}</codpuntocontrol>
<latitud>${latitud}</latitud>
<longitud>${longitud}</longitud>
<fechallegada>${fechallegada}</fechallegada>
<horallegada>${horallegada}</horallegada>`;

    if (sinsalida === "S" || sinsalida === true) {
      variables += `<sinsalida>S</sinsalida>`;
    } else if (fechasalida && horasalida) {
      variables += `<fechasalida>${fechasalida}</fechasalida>
<horasalida>${horasalida}</horasalida>`;
    }

    const innerXML = this._buildRNDCXML(1, 60, variables);
    const soapXML = this._buildSOAPEnvelope(innerXML);
    const start = Date.now();

    try {
      logger.info(
        `Registering RMM: ${ingresoidmanifiesto} - Point ${codpuntocontrol}`,
      );

      const response = await this.axiosInstance.post(this.endpoint, soapXML, {
        timeout: this.axiosInstance.defaults.timeout,
      });

      const parsed = await this._parseResponse(response.data);
      await this._logInteraction("registro_rmm", soapXML, start, parsed, null, {
        ingresoidmanifiesto,
        numplaca,
        codpuntocontrol,
      });
      return parsed;
    } catch (error) {
      logger.error(`Error registering RMM: ${error.message}`);
      await this._logInteraction("registro_rmm", soapXML, start, null, error, {
        ingresoidmanifiesto,
        numplaca,
        codpuntocontrol,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Annul RMM
   * @param {Object} datos - Annulment Data
   */
  async anularRMM(datos) {
    const {
      numidgps,
      ingresoidrmm,
      ingresoidmanifiesto,
      numplaca,
      codpuntocontrol,
      observaciones,
    } = datos;

    const variables = `<numidgps>${numidgps}</numidgps>
<ingresoidrmm>${ingresoidrmm}</ingresoidrmm>
<ingresoidmanifiesto>${ingresoidmanifiesto}</ingresoidmanifiesto>
<numplaca>${numplaca}</numplaca>
<codpuntocontrol>${codpuntocontrol}</codpuntocontrol>
<observaciones>${observaciones}</observaciones>`;

    const innerXML = this._buildRNDCXML(1, 68, variables);
    const soapXML = this._buildSOAPEnvelope(innerXML);
    const start = Date.now();

    try {
      logger.info(`Annulling RMM: ${ingresoidrmm}`);

      const response = await this.axiosInstance.post(this.endpoint, soapXML, {
        timeout: this.axiosInstance.defaults.timeout,
      });

      const parsed = await this._parseResponse(response.data);
      await this._logInteraction("anular_rmm", soapXML, start, parsed, null, {
        ingresoidrmm,
        ingresoidmanifiesto,
      });
      return parsed;
    } catch (error) {
      logger.error(`Error annulling RMM: ${error.message}`);
      await this._logInteraction("anular_rmm", soapXML, start, null, error, {
        ingresoidrmm,
        ingresoidmanifiesto,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Register RNMM (Registro de Novedades Monitoreo de Manifiesto)
   * @param {Object} datos - RNMM Data
   */
  async registrarRNMM(datos) {
    const {
      numidgps,
      ingresoidmanifiesto,
      numplaca,
      codpuntocontrol,
      codnovedad,
    } = datos;

    const variables = `<numidgps>${numidgps}</numidgps>
<ingresoidmanifiesto>${ingresoidmanifiesto}</ingresoidmanifiesto>
<numplaca>${numplaca}</numplaca>
<codpuntocontrol>${codpuntocontrol}</codpuntocontrol>
<codnovedad>${codnovedad}</codnovedad>`;

    const innerXML = this._buildRNDCXML(1, 46, variables);
    const soapXML = this._buildSOAPEnvelope(innerXML);
    const start = Date.now();

    try {
      logger.info(
        `Registering RNMM: ${ingresoidmanifiesto} - Point ${codpuntocontrol} - Code ${codnovedad}`,
      );

      const response = await this.axiosInstance.post(this.endpoint, soapXML, {
        timeout: this.axiosInstance.defaults.timeout,
      });

      const parsed = await this._parseResponse(response.data);
      await this._logInteraction(
        "registro_rnmm",
        soapXML,
        start,
        parsed,
        null,
        {
          ingresoidmanifiesto,
          numplaca,
          codpuntocontrol,
          codnovedad,
        },
      );
      return parsed;
    } catch (error) {
      logger.error(`Error registering RNMM: ${error.message}`);
      await this._logInteraction("registro_rnmm", soapXML, start, null, error, {
        ingresoidmanifiesto,
        codpuntocontrol,
        codnovedad,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse SOAP Response
   */
  async _parseResponse(xmlResponse) {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlResponse);

      const body = result["SOAP-ENV:Envelope"]["SOAP-ENV:Body"];

      // Check Faults
      if (body["SOAP-ENV:Fault"]) {
        return {
          success: false,
          error: body["SOAP-ENV:Fault"].faultstring,
        };
      }

      // Extract return value
      let returnValue = body["NS1:AtenderMensajeRNDCResponse"]?.return;

      if (!returnValue) {
        return { success: false, error: "Empty Response" };
      }

      // Normalize: Handle xml2js text extraction for object wrappers with attributes
      let content = returnValue;
      if (typeof returnValue === "object" && returnValue._ !== undefined) {
        content = returnValue._;
      }

      // Logic branch: If content is already an object, process it
      if (typeof content === "object") {
        // Check for specific error keys
        if (content.errormsg || content.ErrorMSG) {
          return {
            success: false,
            error: content.errormsg || content.ErrorMSG,
          };
        }

        // Verify Success markers (ingresoid)
        if (content.ingresoid) {
          return {
            success: true,
            radicado: content.ingresoid,
          };
        }

        // Verify Documents
        if (content.documento) {
          const documentos = Array.isArray(content.documento)
            ? content.documento
            : [content.documento];

          return {
            success: true,
            documentos,
          };
        }

        return { success: true, data: content };
      }

      // Logic branch: If content is a string, decode HTML entities and parse inner XML
      const decodedXML = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();

      // PARCHE PARA XML ROTO DEL RNDC (Error GPS200)
      // El RNDC devuelve XML inválido cerrando tags no abiertos </puntoscontrol></documento>
      if (
        decodedXML.includes("</puntoscontrol>") &&
        !decodedXML.includes("<puntoscontrol>")
      ) {
        logger.warn(
          "Detectado XML mal formado del RNDC (fix automático aplicado)",
        );
        // Intentar extraer error con Regex directamente para evitar fallo del parser
        const errorMatch = decodedXML.match(/<ErrorMSG>(.*?)<\/ErrorMSG>/i);
        if (errorMatch && errorMatch[1]) {
          logger.warn(`RNDC Error (Extracted): ${errorMatch[1]}`);
          return { success: false, error: errorMatch[1] };
        }
      }

      let innerResult;
      try {
        innerResult = await parser.parseStringPromise(decodedXML);
      } catch (innerError) {
        logger.error(`Error parsing inner XML. Content: ${decodedXML}`);
        // Fallback final: intentar buscar errorMSG con regex si el parser falla
        const fallbackMatch =
          decodedXML.match(/<ErrorMSG>(.*?)<\/ErrorMSG>/i) ||
          decodedXML.match(/<errormsg>(.*?)<\/errormsg>/i);
        if (fallbackMatch && fallbackMatch[1]) {
          return { success: false, error: fallbackMatch[1] };
        }
        throw innerError;
      }
      const root = innerResult.root;

      if (root.errormsg || root.ErrorMSG) {
        return {
          success: false,
          error: root.errormsg || root.ErrorMSG,
        };
      }

      if (root.ingresoid) {
        return {
          success: true,
          radicado: root.ingresoid,
        };
      }

      if (root.documento) {
        const documentos = Array.isArray(root.documento)
          ? root.documento
          : [root.documento];

        return {
          success: true,
          documentos,
        };
      }

      return { success: true, data: root };
    } catch (error) {
      logger.error(`Error parsing response: ${error.message}`);
      // Loguear el contenido que falló para depuración
      if (typeof xmlResponse === "string") {
        logger.debug(
          `Failed XML Response start: ${xmlResponse.substring(0, 200)}`,
        );
      }
      return { success: false, error: `Parsing error: ${error.message}` };
    }
  }
}

module.exports = RNDCClient;
